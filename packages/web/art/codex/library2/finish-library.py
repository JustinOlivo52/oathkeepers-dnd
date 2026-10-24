"""Export generated narrative atlases. Raster processing only, never illustration."""
from pathlib import Path
import json, re
from PIL import Image, ImageOps
HERE=Path(__file__).resolve().parent
WEB=HERE.parents[2]; REPO=WEB.parents[1]; ASSETS=WEB/'public/assets'; SOURCE=HERE.parent/'source/library2'
CATALOG=REPO/'packages/content/data/art-catalog.json'

def save_entry(entry):
    catalog=json.loads(CATALOG.read_text()); catalog=[e for e in catalog if e['id']!=entry['id']]
    catalog.append(dict(**({'source':'codex-imagegen','added':'2026-10-24','artStatus':'ready','mechanicsStatus':'not-required','integrationStatus':'pending'} | entry)))
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

def export_terrain():
    for biome,tags in [('cave',['cave','underground','tense']),('crypt',['crypt','dungeon','underground'])]:
        atlas=Image.open(SOURCE/f'tiles-{biome}-source.png').convert('RGB');sheet=Image.new('RGB',(640,128))
        for i in range(5):
            col,row=i%3,i//3
            cell=atlas.crop((round(col*atlas.width/3),round(row*atlas.height/2),round((col+1)*atlas.width/3),round((row+1)*atlas.height/2)))
            sheet.paste(cell.resize((128,128),Image.Resampling.LANCZOS),(i*128,0))
        sheet.save(ASSETS/f'sprites/tiles-{biome}.png')
        props=Image.open(SOURCE/f'props-{biome}-source.png').convert('RGBA');out=Image.new('RGBA',(256,256))
        for i in range(4):
            col,row=i%2,i//2
            cell=props.crop((round(col*props.width/2),round(row*props.height/2),round((col+1)*props.width/2),round((row+1)*props.height/2)))
            # Keep a transparent margin even when source glow reaches a cell edge.
            cell.thumbnail((116,116),Image.Resampling.LANCZOS)
            out.alpha_composite(cell,(col*128+(128-cell.width)//2,row*128+(128-cell.height)//2))
        out.save(ASSETS/f'sprites/props-{biome}.png')
        save_entry(dict(id=f'tiles-{biome}',kind='tileset',title=f'{biome.title()} terrain',tags=tags,tiles=f'sprites/tiles-{biome}.png',props=f'sprites/props-{biome}.png'))
        width,height=24,16
        grid=[list('#'*width) if y in (0,height-1) else list('#'+'.'*(width-2)+'#') for y in range(height)]
        if biome=='cave':
            # Irregular rock shoulders create connected chambers and a four-cell neck.
            for x in range(9,15):
                for y in list(range(1,6))+list(range(10,15)):grid[y][x]='#'
            for x,y in [(3,3),(4,3),(19,12),(20,12),(17,3),(7,12)]:grid[y][x]='~'
        else:
            # Pillared burial halls; central cross-aisle remains broad and clear.
            for x in (7,12,17):
                for y in (3,4,11,12):grid[y][x]='#'
            for x,y in [(4,3),(5,3),(19,12),(20,12),(14,2),(15,2)]:grid[y][x]='~'
        board=dict(id=f'board-{biome}',name='Echoing Limestone Chambers' if biome=='cave' else 'The Diamond Vaults',tileset=f'tiles-{biome}',rows=[''.join(r) for r in grid],
          partySpawns=[dict(x=x,y=y) for y in (7,8) for x in (2,3,4)],enemySpawns=[dict(x=x,y=y) for y in (7,8) for x in (19,20,21,22)],
          supportedFootprints=['1x1','2x2'],largePartySpawns=[dict(x=2,y=6),dict(x=5,y=9)],largeEnemySpawns=[dict(x=19,y=6),dict(x=20,y=10)],
          props=[dict(x=x,y=y,prop=i%4) for i,(x,y) in enumerate([(3,2),(6,12),(18,2),(21,13),(8,5),(16,10),(5,4),(20,4)])])
        path=f'boards/board-{biome}.json';(ASSETS/path).write_text(json.dumps(board,indent=2)+'\n')
        save_entry(dict(id=f'board-{biome}',kind='board',title=board['name'],tags=tags,tiles=f'tiles-{biome}',board=path))
    print('Exported cave/crypt terrain, props and 2x2-capable boards')

def export_companions():
    import runpy
    repack=runpy.run_path(str(HERE/'build-library.py'))['repack']
    specs=[('wren-ashdown','Wren Ashdown','small',94,['halfling','woman','hero','expert','skirmisher']),('brother-odric-vale','Brother Odric Vale','medium',113,['dwarf','man','hero','divine','leader']),('tamsin-reed','Tamsin Reed','medium',128,['elf','woman','hero','expert','archer']),('sister-maren-holt','Sister Maren Holt','medium',128,['human','woman','hero','divine','healer']),('pip-thistlewick','Pip Thistlewick','small',94,['gnome','man','hero','arcane','caster'])]
    atlas=Image.open(SOURCE/'companion-portraits.png')
    for i,(name,title,rules,height,tags) in enumerate(specs):
        sheet=repack(name,height,prefix='hero')
        sprite=dict(file=f'sprites/hero-{name}.png',frameWidth=192,frameHeight=192,size='medium',rulesSize=rules,footprint=dict(width=1,height=1),anchor=dict(x=96,y=166),visibleHeight=166-sheet.crop((0,0,192,192)).getbbox()[1])
        save_entry(dict(id=f'hero-{name}',kind='hero',title=title,tags=tags,sprite=sprite))
        col,row=i%2,i//2;image=atlas.crop((round(col*atlas.width/2),round(row*atlas.height/3),round((col+1)*atlas.width/2),round((row+1)*atlas.height/3)))
        path=f'library/portraits/companion-{name}.webp';webp(image,path,(512,512))
        save_entry(dict(id=f'portrait-{name}',kind='npc',title=f'{title} portrait',tags=tags,image=path))
    print('Exported 5 companions and portraits')

def export_wildshape():
    import runpy
    repack=runpy.run_path(str(HERE/'build-library.py'))['repack']
    atlas=Image.open(SOURCE/'wildshape-portraits.png')
    for i,(name,height,tags) in enumerate([('boar',80,['beast','brute','hostile']),('panther',88,['beast','skirmisher','forest']),('giant-badger',78,['beast','brute','forest'])]):
        sheet=repack(name,height)
        sprite=dict(file=f'sprites/monster-{name}.png',frameWidth=192,frameHeight=192,size='medium',rulesSize='medium',footprint=dict(width=1,height=1),anchor=dict(x=96,y=166),visibleHeight=166-sheet.crop((0,0,192,192)).getbbox()[1])
        title=name.replace('-',' ').title()
        save_entry(dict(id=f'monster-{name}',kind='monster',title=title,tags=tags,sprite=sprite,monsterId=name,mechanicsStatus='pending'))
        col,row=i%2,i//2;image=atlas.crop((round(col*atlas.width/2),round(row*atlas.height/2),round((col+1)*atlas.width/2),round((row+1)*atlas.height/2)))
        path=f'library/portraits/monster-{name}.webp';webp(image,path,(512,512))
        save_entry(dict(id=f'portrait-{name}',kind='npc',title=f'{title} portrait',tags=tags,monsterId=name,image=path))
    print('Exported 3 Wild Shape beasts and portraits')
