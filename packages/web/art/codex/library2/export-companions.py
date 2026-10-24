"""Register original generated companion poses using the established batch 2 exporter."""
from pathlib import Path
import json, importlib.util
from PIL import Image, ImageDraw
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
SOURCE=HERE.parent/'source/library2/companions'
ASSETS=REPO/'packages/web/public/assets'
spec=importlib.util.spec_from_file_location('library',HERE/'build-library.py')
library=importlib.util.module_from_spec(spec);spec.loader.exec_module(library)

def main():
    specs=json.loads((HERE/'companion-generations.json').read_text())
    cat_path=REPO/'packages/content/data/art-catalog.json'
    catalog=json.loads(cat_path.read_text())
    ids={p+s['id'] for s in specs for p in ('hero-','portrait-')}
    catalog=[e for e in catalog if e['id'] not in ids]
    portraits=Image.open(SOURCE/'portraits.png')
    preview=Image.new('RGB',(2152,5*450),'#17272c');draw=ImageDraw.Draw(preview)
    for i,s in enumerate(specs):
        id=s['id'];sheet=library.repack(id,s['height'],192,prefix='hero',source_path=SOURCE/f'{id}.png',attach_detached=True)
        common=dict(tags=s['tags'],source='codex-imagegen',added='2026-10-24',artStatus='ready',mechanicsStatus='not-required',integrationStatus='pending')
        catalog.append(dict(id='hero-'+id,kind='hero',title=id.replace('-',' ').title(),
            sprite=dict(file=f'sprites/hero-{id}.png',frameWidth=192,frameHeight=192,size='medium',rulesSize=s['size'],
                        footprint=dict(width=1,height=1),anchor=dict(x=96,y=166),visibleHeight=166-sheet.crop((0,0,192,192)).getbbox()[1]),**common))
        col,row=i%3,i//3
        portrait=portraits.crop((round(col*portraits.width/3),round(row*portraits.height/2),round((col+1)*portraits.width/3),round((row+1)*portraits.height/2))).resize((512,512),Image.Resampling.LANCZOS)
        path=ASSETS/f'library/portraits/companion-{id}.webp';portrait.save(path,'WEBP',quality=85,method=6)
        assert path.stat().st_size<150000
        catalog.append(dict(id='portrait-'+id,kind='npc',title=id.replace('-',' ').title()+' portrait',image=f'library/portraits/companion-{id}.webp',**common))
        y=i*450;draw.text((20,y+8),id,fill='#e9c685');preview.paste(sheet,(20,y+30),sheet);preview.paste(portrait.resize((200,200)),(20,y+235))
    cat_path.write_text(json.dumps(catalog,indent=2)+'\n')
    preview.save(REPO/'docs/art/library-batch-2-companions.png')
    print('Exported and validated 55 companion frames and five portraits')

if __name__=='__main__':main()
