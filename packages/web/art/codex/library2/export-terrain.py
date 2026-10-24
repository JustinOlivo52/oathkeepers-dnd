"""Export generated cave/crypt terrain and create validated tactical layouts."""
from pathlib import Path
import json
from PIL import Image, ImageOps, ImageDraw
HERE=Path(__file__).resolve().parent;REPO=HERE.parents[4]
ASSETS=REPO/'packages/web/public/assets';SOURCE=HERE.parent/'source/library2/terrain'

def export_set(name):
    atlas=Image.open(SOURCE/f'tiles-{name}.png').convert('RGB')
    sheet=Image.new('RGB',(640,128))
    for i in range(5):
        cell=atlas.crop((round(i*atlas.width/5),0,round((i+1)*atlas.width/5),atlas.height))
        sheet.paste(ImageOps.fit(cell,(128,128),method=Image.Resampling.LANCZOS),(i*128,0))
    sheet.save(ASSETS/f'sprites/tiles-{name}.png')
    source=Image.open(SOURCE/f'props-{name}.png').convert('RGBA')
    props=Image.new('RGBA',(256,256))
    for i in range(4):
        x,y=i%2,i//2
        cell=source.crop((round(x*source.width/2),round(y*source.height/2),round((x+1)*source.width/2),round((y+1)*source.height/2)))
        cell=cell.crop(cell.getbbox());cell.thumbnail((112,112),Image.Resampling.LANCZOS)
        props.alpha_composite(cell,(x*128+(128-cell.width)//2,y*128+(128-cell.height)//2))
    props.save(ASSETS/f'sprites/props-{name}.png')
    rows=[list('#'*22)]+[list('#'+'.'*20+'#') for _ in range(12)]+[list('#'*22)]
    for y in [1,2,3,4,9,10,11,12]:rows[y][10]='#'
    for x,y in [(5,3),(5,4),(16,3),(16,4),(6,10),(15,10)]:rows[y][x]='#'
    for x,y in [(7,4),(8,4),(13,9),(14,9),(6,8),(16,5)]:rows[y][x]='~'
    board=dict(id=f'board-{name}',name='Winding Cave Chambers' if name=='cave' else 'The Burial Halls',tileset=f'tiles-{name}',rows=[''.join(r) for r in rows],
        props=[dict(x=x,y=y,prop=i%4) for i,(x,y) in enumerate([(3,2),(7,3),(17,2),(19,10),(4,11),(13,11),(14,3),(8,10)])],
        partySpawns=[dict(x=x,y=y) for y in [6,7] for x in [2,3,4]],
        enemySpawns=[dict(x=x,y=y) for y in [6,7] for x in [17,18,19,20]],
        supportedFootprints=['1x1','2x2'],largePartySpawns=[dict(x=2,y=9)],largeEnemySpawns=[dict(x=17,y=9)])
    (ASSETS/f'boards/board-{name}.json').write_text(json.dumps(board,indent=2)+'\n')
    preview=Image.new('RGB',(22*64,14*64),'#17272c')
    for y,row in enumerate(rows):
        for x,tile in enumerate(row):
            frame=3 if tile=='#' else 4 if tile=='~' else (x*7+y*3)%3
            preview.paste(sheet.crop((frame*128,0,(frame+1)*128,128)).resize((64,64)),(x*64,y*64))
    for p in board['props']:
        i=p['prop'];cell=props.crop((i%2*128,i//2*128,(i%2+1)*128,(i//2+1)*128)).resize((64,64))
        preview.paste(cell,(p['x']*64,p['y']*64),cell)
    preview.save(REPO/f'docs/art/board-{name}-preview.png')
    return [dict(id=f'tiles-{name}',kind='tileset',title=name.title()+' terrain',tags=[name,'underground','dungeon' if name=='crypt' else 'eerie'],tiles=f'sprites/tiles-{name}.png',props=f'sprites/props-{name}.png'),
            dict(id=f'board-{name}',kind='board',title=board['name'],tags=[name,'underground','dungeon' if name=='crypt' else 'eerie'],tiles=f'tiles-{name}',board=f'boards/board-{name}.json')]

def main():
    path=REPO/'packages/content/data/art-catalog.json';catalog=json.loads(path.read_text())
    ids={p+n for n in ['cave','crypt'] for p in ['tiles-','board-']}
    catalog=[e for e in catalog if e['id'] not in ids]
    for name in ['cave','crypt']:
        for e in export_set(name):
            catalog.append(dict(source='codex-imagegen',added='2026-10-24',artStatus='ready',mechanicsStatus='not-required',integrationStatus='pending',**e))
    path.write_text(json.dumps(catalog,indent=2)+'\n')
    print('Exported cave/crypt tiles, props and boards; run catalog board validation next')

if __name__=='__main__':main()
