"""Export existing painted spell atlases; no image generation.

Python 3, Pillow and numpy. Run with --batch 1, 2 or 3 (20/20/10 effects),
or --batch all. Source hashes pin the reviewed originals and cleaned atlas.
"""
from pathlib import Path
import argparse
import hashlib
import json
import numpy as np
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
SOURCE = HERE.parent / 'source/completion'
ASSETS = REPO / 'packages/web/public/assets'
DOCS = REPO / 'docs/art'
MANIFEST = json.loads((HERE / 'vfx-manifest.json').read_text())
LOCK = json.loads((HERE / 'vfx-source-lock.json').read_text())
PROJECTILE_PHASES = [1, 2, 3, 4]
FADE = [0.25, 0.60, 0.90, 1.0, 0.85, 0.55, 0.25, 0.04]


def frame_from_cell(atlas, row, phase, size, gain, row_bounds=None, column_bounds=None):
    top, bottom = row_bounds or (round(row*atlas.height/4),round((row+1)*atlas.height/4))
    left,right = (column_bounds[phase],column_bounds[phase+1]) if column_bounds else (round(phase*atlas.width/8),round((phase+1)*atlas.width/8))
    box = (left,top,right,bottom)
    cell = atlas.crop(box)
    pixels = np.array(cell)
    # Soft edge window isolates neighboring atlas glows, without a hard crop seam.
    # Preserve the common source canvas so growth and pose size stay consistent.
    y, x = np.mgrid[:cell.height, :cell.width]
    distance = np.minimum.reduce([x, y, cell.width-1-x, cell.height-1-y])
    window = np.clip(distance / 14.0, 0, 1)
    window = window*window*(3-2*window)
    alpha = pixels[:, :, 3].astype(float)
    alpha[alpha < 8] = 0  # Discard almost invisible atlas noise.
    pixels[:, :, 3] = np.rint(alpha*window*gain).astype(np.uint8)
    cell = Image.fromarray(pixels)
    if column_bounds:
        # Shared row canvas prevents variable crop widths from rescaling poses.
        canvas_size=max(bottom-top,max(b-a for a,b in zip(column_bounds,column_bounds[1:])))
        canvas=Image.new('RGBA',(canvas_size,canvas_size))
        canvas.paste(cell,((canvas_size-cell.width)//2,(canvas_size-cell.height)//2))
        cell=canvas
    inset = {64: 6, 192: 16, 384: 32}[size]
    if row_bounds:
        cell.thumbnail((size-2*inset,size-2*inset),Image.Resampling.LANCZOS)
    else:
        cell = cell.resize((size-2*inset, size-2*inset), Image.Resampling.LANCZOS)
    out = Image.new('RGBA', (size, size))
    out.alpha_composite(cell, ((size-cell.width)//2,(size-cell.height)//2))
    return out, box


def preview(entries):
    # Every frame is visible, including all four projectile loop phases.
    width, row_height = 1000, 112
    contact = Image.new('RGB', (width, max(1,len(entries))*row_height), '#24262b')
    draw = ImageDraw.Draw(contact)
    for row, e in enumerate(entries):
        v = e['vfx']; sheet = Image.open(ASSETS/v['file']).convert('RGBA')
        draw.text((8,row*row_height+3), e['id']+' / '+v['role'], fill='white')
        for i in range(v['frames']):
            size = v['frameWidth']
            frame = sheet.crop((i*size,0,(i+1)*size,size)).resize((80,80),Image.Resampling.LANCZOS)
            contact.paste(frame,(10+i*120,row*row_height+25),frame)
    contact.save(DOCS/'spell-effects.jpg', quality=85)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--batch', choices=['1','2','3','all'], required=True)
    args = parser.parse_args()
    effects = MANIFEST['effects']
    start = 0 if args.batch == 'all' else (int(args.batch)-1)*20
    selected = {e['id'] for e in effects[start:None if args.batch=='all' else start+20]}
    atlases = {}
    for job in MANIFEST['jobs']:
        if not any(e['id'] in selected for e in job['effects']): continue
        lock = LOCK[job['id']]; path = SOURCE/lock['file']
        assert hashlib.sha256(path.read_bytes()).hexdigest() == lock['sha256'], path
        atlas = Image.open(path).convert('RGBA')
        assert atlas.size == (lock['width'],lock['height']), path
        atlases[job['id']] = atlas
    catalog_path = REPO/'packages/content/data/art-catalog.json'
    catalog = json.loads(catalog_path.read_text())
    report_path = DOCS/'spell-effects-export-report.json'
    report = json.loads(report_path.read_text()) if report_path.exists() else {'effects':[]}
    reports = {e['id']:e for e in report['effects']}
    for job in MANIFEST['jobs']:
        if job['id'] not in atlases: continue
        atlas = atlases[job['id']]
        for row, effect in enumerate(job['effects']):
            asset_id, role = effect['id'], effect['role']
            if asset_id not in selected: continue
            size = {'projectile':64,'impact':192,'area':384}[role]
            phases = PROJECTILE_PHASES if role=='projectile' else list(range(8))
            sheet = Image.new('RGBA',(len(phases)*size,size))
            frame_reports = []
            for i, phase in enumerate(phases):
                row_bounds = LOCK[job['id']].get('rowBounds')
                column_bounds = LOCK[job['id']].get('columnBounds')
                frame, box = frame_from_cell(atlas,row,phase,size,1 if role=='projectile' else FADE[i],
                                            row_bounds[row] if row_bounds else None,
                                            column_bounds[row] if column_bounds else None)
                bbox = frame.getbbox()
                assert bbox and min(bbox[:2])>0 and max(bbox[2:])<size, (asset_id,i,bbox)
                assert frame.getchannel('A').getextrema()[0]==0, (asset_id,i)
                sheet.paste(frame,(i*size,0))
                frame_reports.append({'sourcePhase':phase,'sourceCrop':list(box),'bounds':list(bbox),
                                      'alphaGain':1 if role=='projectile' else FADE[i]})
            file = f'sprites/vfx/{asset_id}.png'
            path = ASSETS/file; path.parent.mkdir(parents=True,exist_ok=True)
            sheet.save(path,optimize=True)
            assert path.stat().st_size < 2000000, (asset_id,'byte budget')
            entry = dict(id=asset_id,kind='vfx',title=asset_id.removeprefix('vfx-').replace('-',' ').title(),
                         tags=[],vfx=dict(file=file,frameWidth=size,frameHeight=size,frames=len(phases),
                                         fps=14 if role=='projectile' else 16,role=role),
                         artStatus='ready',mechanicsStatus='not-required',integrationStatus='pending',
                         source='codex-imagegen',added='2026-10-24')
            old = next((e for e in catalog if e['id']==asset_id),None)
            if old:
                assert old.get('vfx',{}).get('file') == file, 'Refusing conflicting catalog asset'
                # Preserve manually reviewed readiness; exporter never promotes integration.
                entry.update({k:old[k] for k in ['artStatus','integrationStatus']})
                catalog[catalog.index(old)] = entry
            else: catalog.append(entry)
            reports[asset_id] = dict(id=asset_id,role=role,file=file,frames=len(phases),frameSize=size,
                source=str((SOURCE/LOCK[job['id']]['file']).relative_to(REPO)),
                sourceSha256=LOCK[job['id']]['sha256'],sourceRow=row,frameDetails=frame_reports,
                bytes=path.stat().st_size,sha256=hashlib.sha256(path.read_bytes()).hexdigest())
            print(asset_id, sheet.size, path.stat().st_size)
    assert len({e['id'] for e in catalog}) == len(catalog)
    catalog_path.write_text(json.dumps(catalog,indent=2)+'\n')
    report['effects'] = [reports[e['id']] for e in effects if e['id'] in reports]
    report['exported'] = len(report['effects']); report['planned'] = len(effects)
    report['processing'] = 'alpha < 8/255 noise cutoff; 14px source-cell edge window; shared canvas scale; authored fade gain'
    report_path.write_text(json.dumps(report,indent=2)+'\n')
    preview([e for e in catalog if e['id'] in reports])
    print(f"Checkpoint saved locally: {report['exported']}/{len(effects)} effects")


if __name__ == '__main__': main()
