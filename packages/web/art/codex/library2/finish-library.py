"""Export generated narrative atlases. Raster processing only, never illustration."""
from pathlib import Path
import json, re
from PIL import Image, ImageOps
HERE=Path(__file__).resolve().parent
WEB=HERE.parents[2]; REPO=WEB.parents[1]; ASSETS=WEB/'public/assets'; SOURCE=HERE.parent/'source/library2'
CATALOG=REPO/'packages/content/data/art-catalog.json'

def save_entry(entry):
    catalog=json.loads(CATALOG.read_text()); catalog=[e for e in catalog if e['id']!=entry['id']]
    catalog.append(dict(source='codex-imagegen',added='2026-10-24',artStatus='ready',mechanicsStatus='not-required',integrationStatus='pending',**entry))
    CATALOG.write_text(json.dumps(catalog,indent=2)+'\n')

def webp(image,path,size,budget=150000,quality=85):
    path=ASSETS/path;path.parent.mkdir(parents=True,exist_ok=True)
    image=ImageOps.fit(image.convert('RGB'),size,method=Image.Resampling.LANCZOS)
    while quality>=45:
        image.save(path,'WEBP',quality=quality,method=6)
        if path.stat().st_size<budget:return
        quality-=5
    raise ValueError(f'Byte budget: {path}')

def export_npcs():
    names=['npc-innkeeper-human','npc-town-guard','npc-blacksmith','npc-priest','npc-priestess-dark','npc-noble','npc-farmer','npc-scholar','npc-hunter','npc-thief','npc-bard','npc-elder','npc-child','npc-mage','npc-soldier-veteran','npc-cult-leader','npc-bandit-leader']
    doc=(REPO/'docs/OATHKEEPERS.md').read_text()
    for i,name in enumerate(names):
        atlas=Image.open(SOURCE/f'npcs-{i//6+1}.png'); index=i%6; col,row=index%2,index//2
        image=atlas.crop((round(col*atlas.width/2),round(row*atlas.height/3),round((col+1)*atlas.width/2),round((row+1)*atlas.height/3)))
        match=re.search(r'^\| '+re.escape(name)+r' \| ([^|]+)\| ([^|]+)\|',doc,re.M)
        assert match,name
        title,tags=match.groups(); tags=[t.strip() for t in tags.strip().split(',')]
        path=f'library/portraits/{name}.webp';webp(image,path,(512,512))
        save_entry(dict(id=name,kind='npc',title=title.strip(),tags=tags,image=path))
    print('Exported 17 NPC portraits')

if __name__=='__main__':export_npcs()

def export_scenes():
    doc=(REPO/'docs/OATHKEEPERS.md').read_text()
    sources=sorted(SOURCE.glob('scene-*.png')); assert len(sources)==14,len(sources)
    for source in sources:
        name=source.stem
        match=re.search(r'^\| '+re.escape(name)+r' \| ([^|]+)\| ([^|]+)\|',doc,re.M);assert match,name
        title,tags=match.groups(); path=f'library/scenes/{name}.webp'
        webp(Image.open(source),path,(1600,900),budget=400000,quality=85)
        save_entry(dict(id=name,kind='scene',title=title.strip(),tags=[t.strip() for t in tags.strip().split(',')],image=path))
    print('Exported 14 scenes')
