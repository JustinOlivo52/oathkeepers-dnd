"""Independent runtime-file audit: Python 3 + Pillow. Does not modify assets."""
from pathlib import Path
import argparse
import hashlib
import json
from PIL import Image

REPO = Path(__file__).resolve().parents[5]
ASSETS = REPO/'packages/web/public/assets'


def main():
    p = argparse.ArgumentParser(); p.add_argument('--expected',type=int,required=True)
    p.add_argument('--require-integrated',action='store_true');args=p.parse_args()
    catalog=json.loads((REPO/'packages/content/data/art-catalog.json').read_text())
    manifest=json.loads((REPO/'packages/web/art/codex/completion/vfx-manifest.json').read_text())
    reports=json.loads((REPO/'docs/art/spell-effects-export-report.json').read_text())
    planned={e['id']:e for e in manifest['effects']}
    entries=[e for e in catalog if e['kind']=='vfx']
    assert len(entries)==len({e['id'] for e in entries})==args.expected
    report_by_id={e['id']:e for e in reports['effects']}
    results=[]
    for e in entries:
        v=e['vfx'];role=v['role'];assert role==planned[e['id']]['role']
        size={'projectile':64,'impact':192,'area':384}[role]
        count=4 if role=='projectile' else 8
        assert (v['frameWidth'],v['frameHeight'],v['frames'])==(size,size,count)
        path=ASSETS/v['file'];im=Image.open(path);assert im.mode=='RGBA' and im.size==(size*count,size)
        assert hashlib.sha256(path.read_bytes()).hexdigest()==report_by_id[e['id']]['sha256']
        source=REPO/report_by_id[e['id']]['source']
        assert hashlib.sha256(source.read_bytes()).hexdigest()==report_by_id[e['id']]['sourceSha256']
        frame_hashes=[];alpha_mass=[]
        for i in range(count):
            frame=im.crop((i*size,0,(i+1)*size,size));bbox=frame.getbbox();assert bbox
            assert min(bbox[:2])>0 and max(bbox[2:])<size,(e['id'],i,'edge clipping')
            a=frame.getchannel('A');assert a.getextrema()[0]==0
            alpha_mass.append(sum(value*n for value,n in enumerate(a.histogram())))
            frame_hashes.append(hashlib.sha256(frame.tobytes()).hexdigest())
        assert len(set(frame_hashes))==count,(e['id'],'repeated frames')
        if role!='projectile':
            assert alpha_mass[-1] < max(alpha_mass)*0.12,(e['id'],'does not fade out')
            assert alpha_mass[0] < max(alpha_mass)*0.50,(e['id'],'does not build up')
        assert e['integrationStatus'] in ('pending','ready')
        if args.require_integrated: assert e['integrationStatus']=='ready',e['id']
        results.append(dict(id=e['id'],role=role,frames=count,size=size,bytes=path.stat().st_size,
                            uniqueFrames=len(set(frame_hashes)),alphaMass=alpha_mass))
    if args.expected==len(planned): assert {e['id'] for e in entries}==set(planned)
    output=dict(passed=True,effects=len(entries),frames=sum(e['frames'] for e in results),
                integrationReady=sum(e['integrationStatus']=='ready' for e in entries),
                roles={role:sum(e['role']==role for e in results) for role in ['projectile','impact','area']},results=results)
    (REPO/'docs/art/spell-effects-audit.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps({k:v for k,v in output.items() if k!='results'}))


if __name__=='__main__': main()
