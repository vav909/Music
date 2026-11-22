"""Génère le visuel « Loops » (rayons violets) : splash (SVG en ligne dans v2/index.html), v2/loops.svg et les icônes.
Usage : python3 design/generer_loops.py   (puis node design/rendre_icones.js pour les PNG)"""
import math, re, pathlib
VIOLET = '#636487'
root = pathlib.Path(__file__).resolve().parent.parent

def rays(n, r_in, r_out_max, w, dotted=True, seed=0.0):
    out = []
    for i in range(n):
        a = 2 * math.pi * i / n - math.pi / 2
        amp = 0.5 + 0.5 * abs(math.sin(i * 0.37 + seed) * math.cos(i * 0.11 + 1 + seed))
        amp2 = 0.5 + 0.5 * math.sin(i * 0.53 + 2 + seed)
        outer = r_out_max - (1 - amp) * (r_out_max - r_in) * 0.38
        a_in = r_in + (r_out_max - r_in) * (0.08 + 0.12 * amp2)
        a_out = outer - (r_out_max - r_in) * (0.18 + 0.22 * amp)
        c, s = math.cos(a), math.sin(a)
        P = lambda r: f'{200 + r * c:.1f} {200 + r * s:.1f}'
        seg = lambda r0, r1, extra='': f'<path d="M{P(r0)}L{P(r1)}" stroke-width="{w}" {extra}/>'
        if not dotted:
            out.append(seg(r_in, outer)); continue
        out.append(seg(r_in, a_in))
        if dotted:
            out.append(seg(a_in, a_out, f'stroke-opacity=".28" stroke-width="{w * .35:.2f}" stroke-dasharray="1 2.2"'))
        out.append(seg(a_out, outer))
    return ''.join(out)

def svg(n, r_in, r_out, w, dotted=True, bg=None, size=400, view=(0, 0, 400, 400)):
    bgr = f'<rect width="400" height="400" fill="{bg}"/>' if bg else ''
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{" ".join(map(str, view))}" width="{size}" height="{size}" fill="none" stroke="{VIOLET}" stroke-linecap="butt">'
            f'{bgr}{rays(n, r_in, r_out, w, dotted)}</svg>')

visual = svg(48, 92, 190, 3.4)
(root / 'v2' / 'loops.svg').write_text(visual, encoding='utf8')
# icône : moins de rayons, plus épais, marge de sécurité « maskable »
(root / 'design' / 'loops-icone.svg').write_text(svg(36, 78, 150, 8, dotted=False, bg='#ffffff', view=(30, 30, 340, 340)), encoding='utf8')
# splash en ligne dans index.html
p = root / 'v2' / 'index.html'; h = p.read_text(encoding='utf8')
h = re.sub(r'(<div id="splash" aria-hidden="true">).*?(</div>)', lambda m: m.group(1) + re.sub(r'width="400" height="400"', 'class="splash-art"', visual) + m.group(2), h, flags=re.S)
p.write_text(h, encoding='utf8')
print('ok')
