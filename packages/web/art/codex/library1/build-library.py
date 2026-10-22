"""Rebuild the approved pilot exports, validate pixels, and write a review gallery.
Run from repository root: python3 packages/web/art/codex/library1/build-library.py
Requires Pillow. Source illustrations are preserved; no illustrations are drawn here.
"""
from pathlib import Path
import json, runpy, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

HERE=Path(__file__).resolve().parent
WEB=HERE.parents[2]
REPO=WEB.parents[1]
ASSETS=WEB/'public/assets'
SOURCE=HERE.parent/'source/library1'
for name in ('skeleton','zombie'):
    runpy.run_path(str(HERE/f'{name}-processing.py'))['repack'](SOURCE/f'{name}-source.png','monster-'+name)
for name in ('wolf','giant-spider','ogre','forest','narrative'):
    runpy.run_path(str(HERE/f'{name}-processing.py'))['main']()
portrait_export=runpy.run_path(str(HERE/'portrait-processing.py'))['export']
for name in ('skeleton','zombie','wolf','giant-spider','ogre'):
    portrait_export(SOURCE/f'{name}-portrait-source.png',name)
catalog=json.loads((REPO/'packages/content/data/art-catalog.json').read_text())
pilot_ids={prefix+name for prefix in ('monster-','portrait-') for name in ('skeleton','zombie','wolf','giant-spider','ogre')} | {'npc-innkeeper-dwarf','npc-guard-captain','npc-merchant','scene-forest-road-day','scene-tavern-night','tiles-forest','board-forest-road'}
pilot=[e for e in catalog if e['id'] in pilot_ids]
assert len(pilot)==17, len(pilot)
for entry in pilot:
    if 'sprite' in entry:
        meta=entry['sprite']; size=meta['frameWidth']; image=Image.open(ASSETS/meta['file']).convert('RGBA')
        assert image.size==(size*11,size), entry['id']
        for frame in range(11):
            cell=image.crop((frame*size,0,(frame+1)*size,size));bounds=cell.getbbox()
            assert bounds and bounds[0]>0 and bounds[1]>0 and bounds[2]<size and bounds[3]<size, (entry['id'],frame,'clipped/empty')
            assert cell.getchannel('A').getextrema()==(0,255), (entry['id'],frame,'alpha')
    if 'image' in entry:
        path=ASSETS/entry['image'];image=Image.open(path)
        assert image.size==((1600,900) if entry['kind']=='scene' else(512,512)), entry['id']
        assert path.stat().st_size<(400000 if entry['kind']=='scene' else 150000), entry['id']
assert Image.open(ASSETS/'sprites/tiles-forest.png').size==(640,128)
# Asset contact sheet: all55frames, everyportrait/scene and a terrain-based board preview.
width=11*210+40
preview=Image.new('RGB',(width,5*250+3*290+400),'#101a1e')
draw=ImageDraw.Draw(preview)
try: font=ImageFont.truetype('DejaVuSans.ttf',18)
except OSError: font=ImageFont.load_default()
y=12
for entry in [e for e in pilot if e['kind']=='monster']:
    draw.text((20,y),entry['title']+' / art ready, mechanics pending',font=font,fill='#dfc88f')
    meta=entry['sprite'];size=meta['frameWidth'];sheet=Image.open(ASSETS/meta['file']).convert('RGBA')
    for frame in range(11):
        art=sheet.crop((frame*size,0,(frame+1)*size,size));art.thumbnail((200,200),Image.Resampling.NEAREST)
        x=20+frame*210;draw.rectangle((x,y+30,x+200,y+230),fill='#2a383c')
        preview.paste(art,(x,y+30),art);draw.text((x+5,y+32),str(frame),font=font,fill='#b3c3c1')
    y+=250
portraits=[e for e in pilot if e['kind']=='npc']
for idx,entry in enumerate(portraits):
    x=20+(idx%8)*285
    art=Image.open(ASSETS/entry['image']).convert('RGB').resize((255,255))
    preview.paste(art,(x,y));draw.text((x,y+260),entry['id'].replace('portrait-','')[:23],font=font,fill='#dfc88f')
y+=290
for idx,entry in enumerate([e for e in pilot if e['kind']=='scene']):
    art=Image.open(ASSETS/entry['image']).convert('RGB').resize((1056,594))
    preview.paste(art,(20+idx*1150,y));draw.text((20+idx*1150,y+598),entry['title'],font=font,fill='#dfc88f')
y+=640
board=json.loads((ASSETS/'boards/board-forest-road.json').read_text())
tiles=Image.open(ASSETS/'sprites/tiles-forest.png').convert('RGB');board_image=Image.new('RGB',(22*48,14*48))
for gy,row in enumerate(board['rows']):
 for gx,ch in enumerate(row):
  frame=3 if ch=='#' else 4 if ch=='~' else (gx*3+gy)%3
  tile=tiles.crop((frame*128,0,(frame+1)*128,128)).resize((48,48),Image.Resampling.NEAREST)
  board_image.paste(tile,(gx*48,gy*48))
# Extend rather than accidentally crop the final board section.
expanded=Image.new('RGB',(width,y+board_image.height+60),'#101a1e');expanded.paste(preview,(0,0));preview=expanded
preview.paste(board_image,(20,y));ImageDraw.Draw(preview).text((1100,y+20),'Forest board / geometry validated / runtime pending',font=font,fill='#dfc88f')
preview.save(REPO/'docs/art/library-batch-1.png',optimize=True)
html=(HERE/'review-template.html').read_text().replace('__PILOT_DATA__',json.dumps(pilot).replace('</','<\\/'))
(REPO/'docs/art/library-batch-1.html').write_text(html)
print('Validated17pilotassets,55spriteframes; wrote contact sheet and interactive asset review.')
