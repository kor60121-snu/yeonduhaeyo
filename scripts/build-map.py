"""Rebuild map assets with Python + shapely; see DATA-SOURCES.md."""
import json, sys
from pathlib import Path
from shapely.geometry import shape, box, Polygon, MultiPolygon
from shapely.ops import unary_union, transform, polylabel

root = Path(__file__).resolve().parents[1]
provinces = json.load(open(sys.argv[1]))
municipalities = json.load(open(sys.argv[2]))
geoms = {f['properties']['code']: shape(f['geometry']) for f in provinces['features']}
gunwi = next(shape(f['geometry']) for f in municipalities['features'] if f['properties']['name'] == '군위군')
geoms['22'] = unary_union([geoms['22'], gunwi])
geoms['37'] = geoms['37'].difference(gunwi)
geoms['36'] = unary_union([geoms['36'], geoms.pop('24')])

def project(x, y, z=None): return ((x - 125.1) * 210, (38.85 - y) * 245 + 20)

def path_for(geom):
    polygons = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    parts = []
    for poly in polygons:
        if poly.area < 0.12: continue
        for ring in [poly.exterior, *poly.interiors]:
            pts = list(ring.coords)
            parts.append('M' + 'L'.join(f'{x:.1f},{y:.1f}' for x,y in pts) + 'Z')
    return ''.join(parts)

def label_rect(geom, code):
    ratio = 1.2 if code in ['11','21','22','23','25','26','29'] else 2.7 if code == '36' else 1.95
    polygons = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    poly = max(polygons, key=lambda p: p.area)
    center = polylabel(poly, tolerance=0.25)
    bx,by,ex,ey = poly.bounds
    candidates = [(center.x,center.y)]
    candidates += [(bx+(ex-bx)*i/25, by+(ey-by)*j/25) for i in range(2,24) for j in range(2,24)]
    best = None
    # All rectangles remain strictly within their administrative region.
    for cx,cy in candidates:
        if not poly.contains(box(cx-1,cy-1,cx+1,cy+1)): continue
        low,high = 0, 180 if code == '36' else 138
        for _ in range(12):
            w=(low+high)/2;h=w/ratio
            if poly.contains(box(cx-w/2,cy-h/2,cx+w/2,cy+h/2)): low=w
            else: high=w
        if best is None or low>best[2]: best=(cx,cy,low,low/ratio)
    cx,cy,w,h=best
    w*=0.87;h*=0.87
    assert poly.contains(box(cx-w/2,cy-h/2,cx+w/2,cy+h/2))
    return [round(cx-w/2,2),round(cy-h/2,2),round(w,2),round(h,2)]

result = []
for code,geom in geoms.items():
    geom=transform(project,geom.simplify(0.0012,preserve_topology=True))
    rect=label_rect(geom,code)
    polygons = [geom] if geom.geom_type == 'Polygon' else list(geom.geoms)
    main_polygon = max(polygons, key=lambda p: p.area)
    result.append({'code':code,'path':path_for(geom),'label':rect,'bounds':[round(v,2) for v in main_polygon.bounds]})
output=root/'public'/'map.json'
output.parent.mkdir(exist_ok=True,parents=True)
output.write_text(json.dumps(result,separators=(',',':')))
print(f'{output}: {output.stat().st_size:,} bytes')
print([(r['code'],r['label']) for r in result])
