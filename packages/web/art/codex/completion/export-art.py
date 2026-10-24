"""Reproducible crop/register/encode pipeline; all illustrations come from Image Gen.

Requires Python, Pillow, numpy and scipy. No model calls or procedural illustration.
"""
from pathlib import Path
from statistics import median
import argparse, json
import numpy as np
from scipy import ndimage
from PIL import Image, ImageOps

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
ASSETS = REPO / 'packages/web/public/assets'
SOURCE = HERE.parent / 'source/completion'
CATALOG = REPO / 'packages/content/data/art-catalog.json'
MANIFEST = json.loads((HERE / 'manifest.json').read_text())
EXTRA = json.loads((HERE / 'additional-manifest.json').read_text())
META = dict(source='codex-imagegen', added='2026-10-24', artStatus='ready',
            mechanicsStatus='not-required', integrationStatus='pending')
ARCH = dict(barbarian='martial', fighter='martial', monk='martial', bard='expert',
            ranger='expert', rogue='expert', cleric='divine', druid='divine',
            paladin='divine', sorcerer='arcane', warlock='arcane', wizard='arcane')

def add(entry, preserve=False):
    catalog = json.loads(CATALOG.read_text())
    old = next((e for e in catalog if e['id'] == entry['id']), {})
    new = (old | entry) if preserve else (META | entry)
    catalog = [new if e['id'] == entry['id'] else e for e in catalog]
    if not old: catalog.append(new)
    CATALOG.write_text(json.dumps(catalog, indent=2)+'\n')

def grid_cell(im, index, cols, rows):
    x, y = index % cols, index // cols
    return im.crop((round(x*im.width/cols), round(y*im.height/rows),
                    round((x+1)*im.width/cols), round((y+1)*im.height/rows)))

def encode(im, relative, size, budget=150000, quality=85):
    path = ASSETS / relative; path.parent.mkdir(parents=True, exist_ok=True)
    im = ImageOps.fit(im.convert('RGB'), size, method=Image.Resampling.LANCZOS)
    for q in range(quality, 44, -5):
        im.save(path, 'WEBP', quality=q, method=6)
        if path.stat().st_size < budget: return
    raise ValueError(('Byte budget', relative))

def poses(source, count=11, cols=4, rows=3):
    """Extract connected whole poses, including down poses crossing the empty cell."""
    im = Image.open(SOURCE / (source+'.png')).convert('RGBA')
    alpha = np.asarray(im.getchannel('A')) > 40
    labels, _ = ndimage.label(alpha)
    counts = np.bincount(labels.ravel()); counts[0] = 0
    ids = np.argsort(counts)[::-1][:count]
    assert len(ids) == count and min(counts[ids]) > 500, (source, 'missing substantial poses')
    slices = ndimage.find_objects(labels)
    found = []
    for label in ids:
        ys, xs = slices[label-1]
        x0, y0, x1, y1 = xs.start, ys.start, xs.stop, ys.stop
        assert x0 > 0 and y0 > 0 and x1 < im.width and y1 < im.height, (source,'source clipping',x0,y0,x1,y1)
        cell = im.crop((x0, y0, x1, y1))
        mask = Image.fromarray(np.uint8(labels[ys, xs] == label)*255)
        cell.putalpha(mask)
        found.append((y1,(x0+x1)/2,cell))
    # Generated row heights can drift; feet/bottom coordinates cluster by row.
    # Sort each known 4/4/3-pose row spatially instead of rigid cell slicing.
    found.sort(key=lambda item:item[0]); result=[]; offset=0
    for n in [4,4,3]*(count//11):
        row=found[offset:offset+n]; result.extend(item[2] for item in sorted(row,key=lambda item:item[1])); offset+=n
    return result

def sheet(cells, relative, height=128, size=192):
    scale = min(height/median(c.height for c in cells[:6]),
                (size-16)/max(c.width for c in cells), (size*.8)/max(c.height for c in cells))
    out = Image.new('RGBA', (size*11, size))
    ax, ay = (192,340) if size == 384 else (96,166)
    for i, cell in enumerate(cells):
        cell = cell.resize((max(1,round(cell.width*scale)),max(1,round(cell.height*scale))), Image.Resampling.NEAREST)
        a = np.asarray(cell.getchannel('A')); feet = np.where(a[round(cell.height*.85):] > 0)[1]
        footx = float(np.median(feet)) if len(feet) and i != 10 else cell.width/2
        x = max(6, min(size-6-cell.width, round(ax-footx)))
        out.alpha_composite(cell, (i*size+x, ay-cell.height))
    path = ASSETS / relative; path.parent.mkdir(parents=True, exist_ok=True)
    out.save(path, optimize=True)
    for i in range(11):
        box = out.crop((i*size,0,(i+1)*size,size)).getbbox()
        assert box and 0 < box[0] < box[2] < size and 0 < box[1] < box[3] < size, (relative,i,box)
    return dict(file=relative, frameWidth=size, frameHeight=size, size='large' if size==384 else 'medium',
                rulesSize='large' if size==384 else 'medium', footprint=dict(width=size//192,height=size//192),
                anchor=dict(x=ax,y=ay), visibleHeight=ay-out.crop((0,0,size,size)).getbbox()[1])

def classes():
    for name, presentation, *_ in MANIFEST['classes']:
        source = 'class-'+name
        if not (SOURCE/(source+'.png')).exists(): continue
        cells = poses(source, 22, rows=6)
        for small in (False,True):
            asset = 'hero-class-'+name+('-small' if small else '')
            sprite = sheet(cells[11:] if small else cells[:11], 'sprites/'+asset+'.png', 86 if small else 128)
            sprite['rulesSize'] = 'small' if small else 'medium'
            add(dict(id=asset, kind='hero', title=name.title()+(' (Small)' if small else ''), classId=name,
                     tags=[ARCH[name],'hero','archer' if name=='ranger' else 'caster' if ARCH[name] in ('arcane','divine') else 'skirmisher'], sprite=sprite))
        print('Class:',name)

def portraits():
    for job in [j for j in MANIFEST['jobs'] if j['kind']=='portraits']:
        path = SOURCE/(job['id']+'.png')
        if not path.exists(): continue
        atlas = Image.open(path)
        for row,(species,_,presentations) in enumerate(job['species']):
            for col,arch in enumerate(['martial','expert','arcane','divine']):
                asset = f'player-{species}-{arch}'; relative = f'library/portraits/{asset}.webp'
                encode(grid_cell(atlas,row*4+col,4,3),relative,(512,512))
                add(dict(id=asset,kind='portrait',title=f'{species.title()} {arch}',
                         tags=[species,arch,presentations[col],'hero'],image=relative))
        print('Portraits:',job['id'])

def cards():
    for job in [j for j in MANIFEST['jobs'] if j['kind']=='cards']:
        path = SOURCE/(job['id']+'.png')
        if not path.exists(): continue
        atlas = Image.open(path)
        for i,item in enumerate(job['items']):
            asset = 'card-'+item['id']; kind,name = item['id'].split('-',1)
            relative = f'library/cards/{item["id"]}.webp'
            encode(grid_cell(atlas,i,2,3),relative,(768,512),quality=80)
            add(dict(id=asset,kind='card',title=name.title()+' card',tags=[],image=relative,
                     **{kind+'Id':name}))
        print('Cards:',job['id'])

def companions():
    for name,_,_,height,tags in EXTRA['companions']:
        source='companion-'+name
        if not (SOURCE/(source+'.png')).exists(): continue
        sprite=sheet(poses(source),f'sprites/hero-{name}.png',height)
        if name in ('wren-ashdown','pip-thistlewick'): sprite['rulesSize']='small'
        add(dict(id='hero-'+name,kind='hero',title=name.replace('-',' ').title(),tags=tags,sprite=sprite))
        print('Companion:',name)

def beasts():
    for i,(name,_,_,height) in enumerate(EXTRA['beasts']):
        source='beast-'+name
        if not (SOURCE/(source+'.png')).exists(): continue
        sprite=sheet(poses(source),f'sprites/monster-{name}.png',height)
        tags=['beast','brute' if name!='panther' else 'skirmisher','forest']
        add(dict(id='monster-'+name,kind='monster',monsterId=name,title=name.title(),tags=tags,
                 mechanicsStatus='pending',sprite=sprite))
        pp=SOURCE/'beast-portraits.png'
        if pp.exists():
            relative=f'library/portraits/monster-{name}.webp'
            encode(grid_cell(Image.open(pp),i,2,2),relative,(512,512))
            add(dict(id='portrait-'+name,kind='npc',monsterId=name,title=name.title()+' portrait',tags=tags,image=relative))
        print('Beast:',name)

def fixes():
    for name,source,height in [('giant-spider','fix-spider',150),('ogre','fix-ogre',256)]:
        if not (SOURCE/(source+'.png')).exists(): continue
        sprite=sheet(poses(source),f'sprites/monster-{name}.png',height,384)
        add(dict(id='monster-'+name,sprite=sprite),preserve=True)
        print('Fixed:',name)
    if (SOURCE/'forest-tiles.png').exists():
        atlas=Image.open(SOURCE/'forest-tiles.png').convert('RGB');out=Image.new('RGB',(640,128))
        for i in range(5): out.paste(grid_cell(atlas,i,3,2).resize((128,128),Image.Resampling.LANCZOS),(i*128,0))
        out.save(ASSETS/'sprites/tiles-forest.png')
    if (SOURCE/'forest-props.png').exists():
        atlas=Image.open(SOURCE/'forest-props.png').convert('RGBA');out=Image.new('RGBA',(256,256))
        for i in range(4):
            cell=grid_cell(atlas,i,2,2); a=cell.getchannel('A').point(lambda v:255 if v>40 else 0);cell.putalpha(a)
            cell=cell.crop(cell.getbbox());cell.thumbnail((116,116),Image.Resampling.LANCZOS)
            out.alpha_composite(cell,((i%2)*128+(128-cell.width)//2,(i//2)*128+(128-cell.height)//2))
        out.save(ASSETS/'sprites/props-forest.png')
        add(dict(id='tiles-forest',props='sprites/props-forest.png'),preserve=True)
        path=ASSETS/'boards/board-forest-road.json';board=json.loads(path.read_text())
        board['props']=[dict(x=x,y=y,prop=i%4) for i,(x,y) in enumerate([(2,2),(6,2),(18,2),(20,12),(3,12),(16,12)])]
        path.write_text(json.dumps(board,indent=2)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('section',choices=['classes','portraits','cards','companions','beasts','fixes','all']);args=parser.parse_args()
    for name in ['classes','portraits','cards','companions','beasts','fixes']:
        if args.section in ('all',name): globals()[name]()
