#!/usr/bin/env python3
"""Génère les maquettes SVG de Solo Looper, à importer dans Figma (glisser-déposer).
Chaque élément devient un calque Figma nommé : formes, textes modifiables, pictos, groupes.
Les couleurs, rayons et tailles reprennent ceux de style.css ; les pictos sont ceux de IC (app.js).

Usage :  python3 design/generer_maquettes.py        (écrit design/figma/*.svg)
"""
import math
import os
import re

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'figma')
C = dict(bg='#ffffff', panel='#f4f6f9', panel2='#e9edf2', line='#d9dfe7', text='#14171c', muted='#6b7686',
         accent='#1f6feb', ink='#ffffff', tint='#dbe8fd', danger='#d93025', light='#a9cdf7', mid='#6aa5ee', ghost='#c9d0da')
FONT = "Inter, Roboto, Arial, sans-serif"
W = 392
_n = {}


def uid(name):
    """Nom de calque unique (Figma reprend l'attribut id comme nom)."""
    name = re.sub(r'[^\w\u00C0-\u00FF-]+', '_', name).strip('_') or 'Calque'
    _n[name] = _n.get(name, 0) + 1
    return name if _n[name] == 1 else f'{name}_{_n[name]}'


def esc(s):
    return str(s).replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def g(name, *kids, tr=None):
    t = f' transform="{tr}"' if tr else ''
    return f'<g id="{uid(name)}"{t}>' + ''.join(kids) + '</g>'


def rect(x, y, w, h, fill, rx=0, stroke=None, sw=1, dash=None, name='Rectangle'):
    a = f'<rect id="{uid(name)}" x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill or "none"}"'
    if stroke:
        a += f' stroke="{stroke}" stroke-width="{sw}"'
    if dash:
        a += f' stroke-dasharray="{dash}"'
    return a + '/>'


def circle(cx, cy, r, fill, name='Cercle', stroke=None, sw=1):
    s = f' stroke="{stroke}" stroke-width="{sw}"' if stroke else ''
    return f'<circle id="{uid(name)}" cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"{s}/>'


def line(x1, y1, x2, y2, stroke, sw=1, name='Trait', cap='butt'):
    return f'<line id="{uid(name)}" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-width="{sw}" stroke-linecap="{cap}"/>'


def text(x, y, s, size=16, weight=400, fill=None, anchor='start', name=None, upper=False):
    fill = fill or C['text']
    s = s.upper() if upper else s
    return (f'<text id="{uid(name or "Texte_" + s[:24].replace(" ", "_"))}" x="{x}" y="{y}" font-family="{FONT}" font-size="{size}" '
            f'font-weight="{weight}" fill="{fill}" text-anchor="{anchor}">{esc(s)}</text>')


def tw(s, size=16, weight=400):
    """Largeur approximative d'un texte (pour centrer et dimensionner les pastilles)."""
    return len(s) * size * (0.56 if weight >= 600 else 0.52)


# ---------- pictos (mêmes tracés que IC dans app.js, trait fin 1,5) ----------
P = {
    'play': '<path d="M8.5 5.5v13l10.5-6.5z"/>', 'pause': '<path d="M9 6v12M15 6v12"/>',
    'stop': '<rect x="7" y="7" width="10" height="10" rx="1.5"/>', 'chev': '<path d="M6 9l6 6 6-6"/>', 'chevUp': '<path d="M6 15l6-6 6 6"/>',
    'pencil': '<path d="M4.5 19.5l.8-3.6L16.2 5a2 2 0 0 1 2.8 2.8L8.1 18.7zM14.5 6.8l2.7 2.7"/>',
    'loop': '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"/>', 'reset': '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>',
    'back': '<path d="M19 12H5M11 6l-6 6 6 6"/>', 'close': '<path d="M6 6l12 12M18 6L6 18"/>', 'plus': '<path d="M12 5v14M5 12h14"/>',
    'minus': '<path d="M5 12h14"/>', 'target': '<circle cx="12" cy="12" r="5.5"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/>',
    'up': '<path d="M12 19V5M6 11l6-6 6 6"/>', 'down': '<path d="M12 5v14M6 13l6 6 6-6"/>',
    'star': '<path d="M12 4.2l2.4 5 5.4.7-4 3.8 1 5.4L12 16.5l-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
    'starOn': '<path d="M12 4.2l2.4 5 5.4.7-4 3.8 1 5.4L12 16.5l-4.8 2.6 1-5.4-4-3.8 5.4-.7z" fill="CUR"/>',
    'eighth': '<ellipse cx="8" cy="18" rx="3.6" ry="2.7" transform="rotate(-20 8 18)"/><path d="M11.3 16.6V4l6.4 3.3c1.5 1.5 1.5 4-.4 6.2"/>',
}


def icon(name, x, y, size=24, color=None, label=None):
    color = color or C['text']
    s = size / 24
    body = P[name].replace('fill="CUR"', f'fill="{color}"')
    return (f'<g id="{uid("Picto_" + (label or name))}" transform="translate({x} {y}) scale({s:.4f})" fill="none" stroke="{color}" '
            f'stroke-width="{1.5 / s:.3f}" stroke-linecap="round" stroke-linejoin="round">{body}</g>')


def chrono(sign, x, y, color=None, size=36):
    color = color or C['text']
    t = ''
    for i in range(12):
        a = i * math.pi / 6
        t += f'<line x1="{16 + math.sin(a) * 11.6:.1f}" y1="{16 - math.cos(a) * 11.6:.1f}" x2="{16 + math.sin(a) * 14.6:.1f}" y2="{16 - math.cos(a) * 14.6:.1f}"/>'
    mid = '<line x1="10.5" y1="16" x2="21.5" y2="16"/>' + ('<line x1="16" y1="10.5" x2="16" y2="21.5"/>' if sign == '+' else '')
    s = size / 32
    return (f'<g id="{uid("Picto_chrono_" + ("plus" if sign == "+" else "moins"))}" transform="translate({x} {y}) scale({s:.4f})" fill="none" stroke="{color}" '
            f'stroke-width="{1.4 / s:.3f}" stroke-linecap="round">{t}{mid}</g>')


def staff_icon(x, y, color=None):
    color = color or C['text']
    ls = ''.join(f'<line x1="2" y1="{v}" x2="32" y2="{v}"/>' for v in (5, 9, 13, 17, 21))
    return (f'<g id="{uid("Picto_portee")}" transform="translate({x} {y})"><g stroke="{color}" stroke-width="1">{ls}</g>'
            f'<ellipse cx="17" cy="17" rx="3.4" ry="2.4" transform="rotate(-20 17 17)" fill="{color}"/>'
            f'<line x1="20.3" y1="16.3" x2="20.3" y2="4.5" stroke="{color}" stroke-width="1.2" stroke-linecap="round"/></g>')


# ---------- composants ----------
def button(x, y, w, h, label, fill=None, color=None, weight=500, ico=None, size=16, rx=14, name=None, stroke=None):
    fill = fill or C['panel2']
    color = color or C['text']
    nm = name or 'Bouton_' + label.replace(' ', '_')[:22]
    parts = [rect(x, y, w, h, fill, rx, stroke=stroke, name='Pastille')]
    ic = 22 if ico else 0
    total = ic + (8 if ico and label else 0) + (tw(label, size, weight) if label else 0)
    cx = x + (w - total) / 2
    if ico:
        parts.append(icon(ico, cx, y + (h - 22) / 2, 22, color))
        cx += ic + 8
    if label:
        parts.append(text(cx, y + h / 2 + size * 0.35, label, size, weight, color, name='Libelle'))
    return g(nm, *parts)


def icon_button(x, y, w, h, ico, fill=None, color=None, size=24, name=None, rx=14):
    parts = []
    if fill:
        parts.append(rect(x, y, w, h, fill, rx, name='Pastille'))
    parts.append(icon(ico, x + (w - size) / 2, y + (h - size) / 2, size, color or C['text']))
    return g(name or 'Bouton_' + ico, *parts)


def chip(x, y, label, on=False, ico=None, h=44):
    w = 28 + (26 if ico else 0) + tw(label, 16, 600 if on else 400)
    fill, color = (C['accent'], C['ink']) if on else (C['panel2'], C['text'])
    parts = [rect(x, y, w, h, fill, h / 2, name='Pastille')]
    cx = x + 14
    if ico:
        parts.append(icon(ico, cx, y + (h - 18) / 2, 18, color)); cx += 26
    parts.append(text(cx, y + h / 2 + 5.5, label, 16, 600 if on else 400, color, name='Libelle'))
    return g('Puce_' + label.replace(' ', '_'), *parts), w


def topbar(title=None, back=False, cover=None, sub=None, right=None):
    parts = [rect(0, 0, W, 60, C['panel'], name='Fond'), line(0, 60, W, 60, C['line'], 1, 'Filet')]
    x = 20
    if back:
        parts.append(icon('back', 14, 17, 26, C['text'])); x = 70
    if cover:
        parts.append(g('Pochette', rect(82, 9, 42, 42, C['panel2'], 8, name='Image'), text(103, 38, '♪', 20, 400, C['muted'], 'middle', name='Note')))
        x = 138
    if sub:
        cut = lambda t, n: t if len(t) <= n else t[:n - 1].rstrip() + '…'
        parts.append(text(x, 29, cut(title, 20), 17, 650, name='Titre'))
        parts.append(text(x, 47, cut(sub, 32), 13, 400, C['muted'], name='Sous-titre'))
    else:
        parts.append(text(x, 38, title, 17 if back else 19, 650, name='Titre'))
    if right == 'plus':
        parts.append(g('Bouton_Ajouter', circle(356, 30, 26, C['accent'], 'Pastille'), icon('plus', 343, 17, 26, C['ink'])))
    elif right == 'pencil':
        parts.append(icon('pencil', 350, 19, 22, C['accent'], 'Modifier'))
    return g('Barre_du_haut', *parts)


def tabbar(active):
    parts = [rect(0, 742, W, 58, C['panel'], name='Fond'), line(0, 742, W, 742, C['line'], 1, 'Filet')]
    for i, lab in enumerate(['Morceaux', 'Solos']):
        on = lab == active
        parts.append(text(98 + 196 * i, 777, lab, 16, 600, C['accent'] if on else C['muted'], 'middle', name='Onglet_' + lab))
    return g('Barre_onglets', *parts)


def wave(x, y, w, h, sel=None, head=None, labels=None, seed=1, light=False):
    """Timeline : petits rectangles, plage sélectionnée, tête de lecture, repères de temps."""
    parts = [rect(x, y, w, h, C['panel'], 14, name='Fond')]
    mid, maxh = (h - 16) / 2, h - 28
    n = int(w // 8)
    bars = []
    for i in range(n):
        a = 0.45 + 0.5 * abs(math.sin(i * 0.77 + seed) * math.cos(i * 0.29 + seed * 0.4))
        bh = max(4, a * maxh)
        bx = x + 2 + i * 8 + 1.5
        inside = sel and sel[0] <= bx <= sel[1]
        col = C['accent'] if inside else C['light']
        bars.append(rect(round(bx, 1), round(y + mid - bh / 2, 1), 5, round(bh, 1), col, name='Barre'))
    if sel:
        parts.append(rect(sel[0], y, sel[1] - sel[0], h, C['accent'], 0, name='Plage_selectionnee').replace('fill="#1f6feb"', 'fill="#1f6feb" fill-opacity="0.10"'))
        parts.append(rect(sel[0] - 1, y, 3, h, C['accent'], 0, name='Bord_debut'))
        parts.append(rect(sel[1] - 2, y, 3, h, C['accent'], 0, name='Bord_fin'))
    parts.append(g('Barres_du_son', *bars))
    for lx, lab in (labels or []):
        parts.append(text(lx, y + h - 6, lab, 11, 400, C['muted'], name='Repere_' + lab.replace(':', '_')))
    if head is not None:
        parts.append(rect(head, y, 3, h, C['text'], 0, name='Tete_de_lecture'))
    return g('Timeline', *parts)


def tools_row(y, time_label):
    return g('Temps_et_zoom', text(10, y + 29, time_label, 16, 400, C['muted'], name='Temps'),
             icon_button(rect_x(272), y, 48, 40, 'minus', C['panel2'], size=20, name='Bouton_dezoomer', rx=14),
             icon_button(rect_x(328), y, 48, 40, 'plus', C['panel2'], size=20, name='Bouton_zoomer', rx=14))


def rect_x(v):
    return v


def slider(y, pct, value, full=False):
    x0, x1 = (80, 248) if full else (22, 322)
    tx = x0 + (x1 - x0) * pct
    parts = []
    if full:
        parts.append(icon_button(10, y - 26, 52, 52, 'minus', C['panel2'], size=20, name='Bouton_tempo_moins'))
        parts.append(icon_button(264, y - 26, 52, 52, 'plus', C['panel2'], size=20, name='Bouton_tempo_plus'))
    parts += [line(x0, y, x1, y, '#dfe3e8', 6, 'Piste', 'round'), line(x0, y, tx, y, C['accent'], 6, 'Piste_remplie', 'round'), circle(tx, y, 10, C['accent'], 'Curseur')]
    parts.append(text(382, y + 6, value, 16, 700, anchor='end', name='Tempo'))
    return g('Curseur_de_tempo', *parts)


def controls(y, full=False):
    parts = [icon_button(10, y, 56, 56, 'loop', C['tint'], size=26, name='Bouton_boucle')]
    if full:
        parts += [chrono('-', 78, y + 10), chrono('+', 278, y + 10)]
    parts.append(g('Bouton_lecture', rect(148, y - 2, 96, 60, C['accent'], 30, name='Pastille'), icon('play', 182, y + 14, 28, C['ink'])))
    parts.append(icon_button(326, y, 56, 56, 'chevUp' if full else 'chev', None, C['muted'], 26, 'Bouton_afficher_tout'))
    return g('Commandes_de_lecture', *parts)


def solo_row(y, name, sub, selected=False, playing=False, open_=False, fav=False, h=72):
    parts = [rect(12, y, 368, h, C['panel'], 16, C['accent'] if selected else None, 2, name='Carte')]
    cy = y + 36
    parts.append(g('Bouton_jouer', circle(44, cy, 22, C['tint'], 'Pastille'), icon('pause' if playing else 'play', 30, cy - 14, 28, C['accent'])))
    parts.append(text(76, cy - 4, name, 17, 650, name='Nom'))
    parts.append(text(76, cy + 18, sub, 14, 400, C['muted'], name='Details'))
    parts.append(icon('starOn' if fav else 'star', 285, cy - 13, 26, C['accent'] if fav else C['muted'], 'favori'))
    if not open_:
        parts.append(icon('pencil', 322, cy - 11, 22, C['accent'], 'details'))
    parts.append(icon('chevUp' if open_ else 'chev', 352, cy - 12, 24, C['muted'], 'deplier'))
    return g('Ligne_solo', *parts)


def input_box(x, y, w, label, value=None, h=48):
    return g('Champ_' + label.replace(' ', '_'), rect(x, y, w, h, C['bg'], 12, C['line'], 1, name='Cadre'),
             text(x + 14, y + h / 2 + 6, value or label, 17, 400, C['text'] if value else C['muted'], name='Valeur'))


def edit_row(y, label, value, compact=False):
    d = -14 if compact else 0
    return g('Reglage_' + label, text(20 + d + (10 if compact else 0), y + 31, label, 14, 400, C['muted'], name='Libelle'), text(78 + d + (8 if compact else 0), y + 33, value, 18, 700, name='Valeur'),
             icon_button(176 + d + 14 if compact else 190, y, 52, 52, 'minus', C['panel2'], size=20, name='Bouton_moins'),
             icon_button(234 + d + 14 if compact else 248, y, 52, 52, 'plus', C['panel2'], size=20, name='Bouton_plus'),
             button(292 + d + 14 if compact else 306, y, 76, 52, 'ici', C['tint'], C['accent'], 700, 'target', name='Bouton_ici'))


def frame(name, h, *kids):
    return g('Ecran_' + name, rect(0, 0, W, h, C['bg'], 0, C['line'], 1, name='Cadre'), *kids)


# ---------- partition (même logique de dessin que score.js, simplifiée) ----------
def score_system(x, top, first=True, seed=0):
    SP = 9
    parts = []
    xe = x + 372
    for i in range(5):
        parts.append(line(x + 6, top + i * SP, xe, top + i * SP, C['text'], 1, 'Ligne_portee'))
    parts.append(line(x + 6, top, x + 6, top + 4 * SP, C['text'], 1.4, 'Barre_debut'))
    cx = x + 10
    g_ = top + 3 * SP
    parts.append(f'<path id="{uid("Cle_de_sol")}" d="M{cx + 12} {top + 4 * SP + 9} C{cx + 12} {top + 4 * SP + 15} {cx + 4} {top + 4 * SP + 14} {cx + 5} {top + 4 * SP + 9} '
                 f'M{cx + 13} {top - 11} C{cx + 20} {top - 6} {cx + 19} {top + 1} {cx + 11} {top + 2 * SP} C{cx + 3} {top + 3.4 * SP} {cx + 1} {g_ + 5} {cx + 8} {g_ + 6.5} '
                 f'C{cx + 17} {g_ + 8} {cx + 19} {g_ - 6} {cx + 10} {g_ - 6.5} C{cx + 3} {g_ - 6.5} {cx + 3} {g_ + 1} {cx + 9} {g_ + 1.5} M{cx + 13} {top - 11} L{cx + 12} {top + 4 * SP + 9}" '
                 f'fill="none" stroke="{C["text"]}" stroke-width="1.7" stroke-linecap="round"/>')
    if first:
        parts.append(text(x + 43, top + 2 * SP - 1, '4', 17, 700, name='Chiffrage_haut'))
        parts.append(text(x + 43, top + 4 * SP - 1, '4', 17, 700, name='Chiffrage_bas'))
    bx0 = x + 62
    mw = (xe - bx0) / 2
    pos = [4, 6, 5, 7, 8, 6, 3, 5, 6, 7, 9, 8, 5, 4, 6, 3]
    pos = pos[seed % 4 * 2:] + pos[:seed % 4 * 2]
    for m in range(2):
        parts.append(line(bx0 + (m + 1) * mw, top, bx0 + (m + 1) * mw, top + 4 * SP, C['text'], 1, 'Barre_de_mesure'))
        notes = []
        for k in range(8):
            nx = bx0 + m * mw + 14 + k * (mw - 22) / 8
            p = pos[m * 8 + k]
            ny = top + 4 * SP - p * SP / 2
            notes.append((nx, ny, p))
        for k in range(0, 8, 2):
            (x1, y1, p1), (x2, y2, p2) = notes[k], notes[k + 1]
            up = (p1 + p2) / 2 < 4
            tip = (min if up else max)(y1 + (-3.5 if up else 3.5) * SP, y2 + (-3.5 if up else 3.5) * SP)
            sx1, sx2 = (x1 + 4.6, x2 + 4.6) if up else (x1 - 4.6, x2 - 4.6)
            for (nx, ny, p) in ((x1, y1, p1), (x2, y2, p2)):
                if p > 8:
                    for q in range(10, p + 1, 2):
                        parts.append(line(nx - 9, top + 4 * SP - q * SP / 2, nx + 9, top + 4 * SP - q * SP / 2, C['text'], 1.2, 'Ligne_supplementaire'))
                parts.append(f'<ellipse id="{uid("Tete_de_note")}" cx="{nx:.1f}" cy="{ny:.1f}" rx="5" ry="3.8" transform="rotate(-20 {nx:.1f} {ny:.1f})" fill="{C["text"]}"/>')
            parts.append(line(round(sx1, 1), round(y1, 1), round(sx1, 1), round(tip, 1), C['text'], 1.3, 'Hampe'))
            parts.append(line(round(sx2, 1), round(y2, 1), round(sx2, 1), round(tip, 1), C['text'], 1.3, 'Hampe'))
            parts.append(line(round(sx1, 1), round(tip, 1), round(sx2, 1), round(tip, 1), C['text'], 3.4, 'Ligature'))
    return g('Systeme_de_portee', *parts)


def section(y, title, open_=True):
    return g('Section_' + title.replace(' ', '_'), line(0, y + 52, W, y + 52, C['line'], 1, 'Filet') if not open_ else '',
             text(14, y + 32, title, 16, 650, name='Titre'), icon('chevUp' if open_ else 'chev', 358, y + 14, 24, C['muted'], 'section'))


def hint(x, y, lines, size=14, color=None):
    return g('Aide', *[text(x, y + i * 19, s, size, 400, color or C['muted'], name='Ligne_aide') for i, s in enumerate(lines)])


# ---------- écrans ----------
def ecran_morceaux():
    parts = [topbar('Solo Looper', right='plus')]
    c, w = chip(12, 70, 'Favoris', ico='star'); parts.append(g('Filtres', c))
    songs = [('Linda Chicana', 'Tito Puente & Latin Ensemble · 4:59 · 2 solos', ['Solo 1 · Flûte', 'Solo 2 · Flûte']),
             ("Feel Like Makin' Love (Live)", 'Hubert Laws · 6:16 · 2 solos', ['Solo ok · Flûte', 'Solo 2 · Flûte']),
             ('So What', 'Miles Davis · 9:22 · 1 solo', ['Solo 1 · Trompette'])]
    y = 126
    for t, sub, solos in songs:
        parts.append(g('Carte_morceau', rect(12, y, 368, 124, C['panel'], 16, name='Carte'), rect(24, y + 12, 48, 48, C['panel2'], 8, name='Pochette'),
                       text(48, y + 43, '♪', 20, 400, C['muted'], 'middle', name='Note'), text(84, y + 33, t, 17, 650, name='Titre'),
                       text(84, y + 53, sub, 13, 400, C['muted'], name='Sous-titre'), icon('close', 342, y + 22, 22, C['muted'], 'supprimer'),
                       *[g('Puce_solo', rect(24 + i * 150, y + 68, 142, 44, C['panel2'], 22, name='Pastille'), rect(38 + i * 150, y + 84, 12, 12, C['accent'], 3, name='Repere'),
                            text(58 + i * 150, y + 95, s, 14, 400, name='Nom')) for i, s in enumerate(solos)]))
        y += 136
    parts.append(tabbar('Morceaux'))
    return frame('Morceaux', 800, *parts)


def ecran_solos():
    parts = [topbar('Solo Looper', right='plus')]
    parts.append(g('Partage', button(12, 70, 180, 44, 'Partager mes solos', ico='up', size=15, name='Bouton_partager'), button(200, 70, 180, 44, 'Importer des solos', ico='down', size=15, name='Bouton_importer')))
    x, fl = 12, []
    for lab, on, ico in (('Favoris', False, 'star'), ('Flûte', True, None), ('Sax alto', False, None)):
        c, w = chip(x, 124, lab, on, ico); fl.append(c); x += w + 8
    parts.append(g('Filtres', *fl))
    rows = [('Solo 1 · Flûte', 'Hubert Laws · Feel Like Makin\' Love · 1:52–2:02', True), ('Solo 2 · Flûte', 'Hubert Laws · Feel Like Makin\' Love · 2:02–2:17', False),
            ('Solo 1 · Flûte', 'Tito Puente · Linda Chicana · 0:02–0:15', False), ('Solo 1 · Trompette', 'Miles Davis · So What · 2:35–4:10', False)]
    y = 180
    for n, s, fav in rows:
        parts.append(g('Ligne_solo', rect(12, y, 368, 72, C['panel'], 16, name='Carte'), rect(28, y + 30, 12, 12, C['accent'], 3, name='Repere'), text(54, y + 32, n, 17, 650, name='Nom'),
                       text(54, y + 54, s, 13, 400, C['muted'], name='Details'), icon('starOn' if fav else 'star', 346, y + 23, 26, C['accent'] if fav else C['muted'], 'favori')))
        y += 80
    parts.append(tabbar('Solos'))
    return frame('Solos', 800, *parts)


def entete_morceau():
    return topbar('Feel Like Makin\' Love (Live)', back=True, cover=True, sub='Hubert Laws · The San Francisco Concert', right='pencil')


def ecran_morceau(variant='replie'):
    full = variant == 'complet'
    h = 1110 if variant == 'deplie' else 800
    parts = [entete_morceau()]
    parts.append(wave(10, 68, 372, 104, sel=(120, 260), head=134, labels=[(16, '1:45'), (98, '1:50'), (184, '1:55'), (270, '2:00')], seed=2))
    parts.append(tools_row(178, '1:53 / 6:16'))
    parts.append(controls(236, full))
    parts.append(slider(318 if not full else 330, 0.0 + (0.58 if variant != 'complet' else 0.3), '100 %' if variant != 'complet' else '60 %', full))
    y = 354
    if full:
        parts.append(g('Tempo_original', button(206, 358, 176, 44, 'Tempo original', ico='reset', size=15, name='Bouton_tempo_original')))
        parts.append(g('Options_de_boucle', button(12, 412, 178, 48, 'Pause entre passages : non', size=13, name='Bouton_pause_entre_passages'), button(198, 412, 182, 48, 'Montée progressive : non', size=13, name='Bouton_montee_progressive')))
        y = 470
    parts.append(line(0, y, W, y, C['line'], 1, 'Filet_du_lecteur'))
    y += 16
    parts.append(g('Nouveau_solo', rect(12, y, 368, 56, C['panel2'], 14, C['line'], 2, '6 4', 'Cadre'), icon('plus', 90, y + 18, 20, C['text']), text(122, y + 34, "Nouveau solo à partir d'ici", 17, 700, name='Libelle')))
    y += 82
    parts.append(g('Titre_liste', text(14, y + 16, 'Solos de ce morceau', 15, 600, C['muted'], name='Titre', upper=True),
                   g('Bouton_favoris', rect(330, y - 6, 48, 36, C['panel2'], 18, name='Pastille'), icon('star', 342, y - 1, 24, C['muted'], 'favoris'))))
    y += 40
    if variant == 'deplie':
        card_h = 534
        parts.append(solo_row(y, 'Solo ok · Flûte', '1:52 – 2:02 · 100% · Hubert laws', selected=True, open_=True, h=card_h))
        yy = y + 84
        parts.append(line(14, y + 72, 378, y + 72, C['line'], 1, 'Filet'))
        parts.append(g('Champs_du_solo', input_box(24, yy, 344, 'Nom du solo', 'Solo ok'), input_box(24, yy + 58, 344, 'Instrument', 'Flûte'), input_box(24, yy + 116, 344, 'Soliste', 'Hubert laws')))
        yy += 184
        parts.append(g('Plage', edit_row(yy, 'Début', '1:52.0', True), edit_row(yy + 60, 'Fin', '2:02.0', True)))
        yy += 132
        parts.append(g('Bouton_Details_du_solo', rect(24, yy, 344, 56, C['accent'], 14, name='Pastille'), text(196, yy + 25, 'Détails du solo', 17, 700, C['ink'], 'middle', name='Libelle'),
                       text(196, yy + 44, 'Partition · transcription · lecture · plage', 13, 400, C['ink'], 'middle', name='Sous-titre')))
        yy += 66
        parts.append(g('Pas_et_suppression', button(24, yy, 168, 52, 'Pas : 1 s', size=16, name='Bouton_pas'), button(200, yy, 168, 52, 'Supprimer', color=C['danger'], size=16, name='Bouton_supprimer')))
        parts.append(solo_row(y + card_h + 10, 'Solo 2 · Flûte', '2:02 – 2:17 · 100%'))
    else:
        parts.append(solo_row(y, 'Solo ok · Flûte', '1:52 – 2:02 · 100% · Hubert laws', selected=True, playing=True, fav=True))
        parts.append(solo_row(y + 80, 'Solo 2 · Flûte', '2:02 – 2:17 · 100%'))
    return frame('Morceau_' + {'replie': 'liste_repliee', 'deplie': 'solo_deplie', 'complet': 'lecteur_complet'}[variant], h, *parts)


def dock(open_=False):
    parts = []
    if open_:
        top = 330
        parts += [rect(0, top, W, 727 - top, C['bg'], 0, name='Fond_panneau'), line(0, top, W, top, C['line'], 1, 'Filet')]
        parts.append(text(14, top + 30, 'Réglages de la partition', 15, 600, C['muted'], name='Titre', upper=True))
        parts.append(icon('chev', 354, top + 14, 24, C['text'], 'replier'))
        y = top + 46
        parts.append(g('Reglage_tempo', text(10, y + 31, 'Tempo', 14, 400, C['muted'], name='Libelle'), icon_button(60, y + 4, 52, 44, 'minus', C['panel2'], size=20, name='Bouton_moins'),
                       text(146, y + 33, '150', 18, 700, anchor='middle', name='Valeur'), icon_button(178, y + 4, 52, 44, 'plus', C['panel2'], size=20, name='Bouton_plus'),
                       button(238, y + 4, 60, 44, '÷2', name='Bouton_diviser'), button(306, y + 4, 60, 44, '×2', name='Bouton_multiplier')))
        y += 58
        parts.append(g('Rythme', button(10, y, 130, 44, 'Taper le tempo', size=15, name='Bouton_taper'), button(148, y, 134, 44, 'Rythme : droit', size=15, name='Bouton_rythme'),
                       button(290, y, 44, 44, '♯', size=17, name='Bouton_diese'), button(342, y, 42, 44, '2', size=15, name='Bouton_mesures')))
        y += 54
        parts.append(hint(14, y + 14, ['Tessiture utilisée : do4 – do7 (flûte). Change l’instrument', 'du solo pour la modifier.']))
        y += 56
        parts.append(g('Tessiture', text(10, y + 29, 'Notes cherchées', 14, 400, C['muted'], name='Libelle'), g('Liste_note_grave', rect(124, y + 4, 72, 44, C['bg'], 12, C['line'], 1, name='Cadre'), text(136, y + 32, 'do4', 16, name='Valeur'), icon('chev', 170, y + 16, 20, C['muted'], 'liste')),
                       text(206, y + 30, 'à', 14, 400, C['muted'], name='a'), g('Liste_note_aigue', rect(224, y + 4, 72, 44, C['bg'], 12, C['line'], 1, name='Cadre'), text(236, y + 32, 'do7', 16, name='Valeur'), icon('chev', 270, y + 16, 20, C['muted'], 'liste')),
                       button(306, y + 4, 76, 44, 'Auto', C['panel'], C['ghost'], size=15, name='Bouton_auto')))
        y += 56
        parts.append(g('Voix_aigue_et_reanalyse', button(10, y, 170, 44, 'Voix aiguë : non', size=15, name='Bouton_voix_aigue'), button(188, y, 120, 44, 'Réanalyser', size=15, name='Bouton_reanalyser')))
    parts.append(g('Bandeau', rect(0, 727, W, 73, C['panel'], 0, name='Fond'), line(0, 727, W, 727, C['line'], 1, 'Filet'),
                   rect(14, 735, 60, 56, C['tint'] if open_ else None, 14, name='Pastille') if open_ else '', staff_icon(27, 750, C['accent'] if open_ else C['text']),
                   g('Bouton_lire_le_solo', rect(111, 735, 170, 56, C['accent'], 28, name='Pastille'), icon('play', 152, 749, 28, C['ink']), text(188, 770, 'Solo', 18, 700, C['ink'], name='Libelle'))))
    return g('Bandeau_du_bas', *parts)


def ecran_details(open_dock=False):
    parts = [topbar('Solo 1 · Flûte', back=True)]
    parts.append(section(60, 'Plage du solo'))
    parts.append(wave(10, 120, 372, 104, sel=(120, 270), head=134, labels=[(16, '1:45'), (100, '1:50'), (186, '1:55'), (272, '2:00')], seed=3))
    parts.append(tools_row(232, '1:53 / 6:16'))
    parts.append(edit_row(284, 'Début', '1:52.0'))
    parts.append(edit_row(344, 'Fin', '2:02.0'))
    parts.append(button(10, 404, 372, 52, 'Pas : 1 s', size=16, name='Bouton_pas'))
    parts.append(hint(14, 484, ['Touche la timeline pour te placer ; « ici » prend la', 'position de lecture comme début ou fin.']))
    parts.append(section(520, 'Partition'))
    parts.append(g('Lecture_de_la_partition', button(14, 580, 156, 48, 'Transcription', C['panel2'], ico='eighth', size=16, name='Bouton_transcription'),
                   button(178, 580, 150, 48, 'Avec le solo', C['panel2'], ico='eighth', size=16, name='Bouton_avec_le_solo')))
    parts.append(g('Partition', score_system(10, 676, True, 0)))
    parts.append(dock(open_dock))
    return frame('Details_solo_' + ('reglages_ouverts' if open_dock else 'plage_et_partition'), 800, *parts)


# ---------- page de styles ----------
def page_styles():
    parts = [text(0, 24, 'Solo Looper : styles et pictos (valeurs de style.css et app.js)', 20, 700, name='Titre')]
    y = 60
    parts.append(text(0, y, 'Couleurs', 15, 600, C['muted'], name='Titre_couleurs', upper=True))
    swatches = [('--bg', 'bg', 'Fond'), ('--panel', 'panel', 'Panneau'), ('--panel2', 'panel2', 'Boutons / pastilles'), ('--line', 'line', 'Filets'),
                ('--text', 'text', 'Texte'), ('--muted', 'muted', 'Texte discret'), ('--accent', 'accent', 'Accent (bleu)'), ('--tint', 'tint', 'Accent clair'),
                ('--danger', 'danger', 'Danger'), ('', 'light', 'Son (barres)'), ('', 'mid', 'Son (autres solos)')]
    for i, (var, k, label) in enumerate(swatches):
        x = (i % 6) * 150
        yy = y + 14 + (i // 6) * 110
        parts.append(g('Couleur_' + k, rect(x, yy, 130, 64, C[k], 14, C['line'], 1, name='Echantillon'), text(x, yy + 84, label, 14, 600, name='Nom'), text(x, yy + 101, (var + '  ' if var else '') + C[k], 12, 400, C['muted'], name='Valeur')))
    y += 260
    parts.append(text(0, y, 'Formes', 15, 600, C['muted'], name='Titre_formes', upper=True))
    parts.append(g('Formes', button(0, y + 16, 150, 52, 'Bouton', name='Exemple_bouton'), button(166, y + 16, 150, 52, 'Principal', C['accent'], C['ink'], 700, name='Exemple_principal'),
                   rect(332, y + 16, 150, 52, C['panel'], 16, name='Exemple_carte'), rect(498, y + 16, 150, 52, C['panel2'], 14, C['line'], 2, '6 4', 'Exemple_pointille'), chip(664, y + 20, 'Puce')[0]))
    parts.append(text(0, y + 96, 'Rayons : boutons 14 · cartes 16 · puces 22 · champs 12 · pastille de lecture 30', 13, 400, C['muted'], name='Note_rayons'))
    parts.append(text(0, y + 114, 'Hauteur minimale d’un bouton : 52 (44 pour les boutons secondaires)', 13, 400, C['muted'], name='Note_hauteur'))
    y += 146
    parts.append(text(0, y, 'Typographie (Inter ou la police du téléphone)', 15, 600, C['muted'], name='Titre_typo', upper=True))
    for i, (s, sz, w) in enumerate([('Titre de page  19 / 650', 19, 650), ('Titre de ligne  17 / 650', 17, 650), ('Texte courant  16 / 400', 16, 400), ('Aide et détails  14 / 400', 14, 400), ('Repères de temps  11 / 400', 11, 400)]):
        parts.append(text(0, y + 30 + i * 30, s, sz, w, C['text'] if i < 3 else C['muted'], name='Typo_' + str(sz)))
    y += 210
    parts.append(text(0, y, 'Pictos (trait fin 1,5 — même tracé que l’app)', 15, 600, C['muted'], name='Titre_pictos', upper=True))
    names = ['play', 'pause', 'stop', 'chev', 'chevUp', 'pencil', 'loop', 'reset', 'back', 'close', 'plus', 'minus', 'target', 'up', 'down', 'star', 'starOn', 'eighth']
    for i, n in enumerate(names):
        x = (i % 9) * 80
        yy = y + 20 + (i // 9) * 90
        parts.append(g('Fiche_' + n, rect(x, yy, 64, 64, C['panel'], 14, name='Fond'), icon(n, x + 16, yy + 16, 32, C['accent'] if n == 'starOn' else C['text'], n), text(x + 32, yy + 80, n, 11, 400, C['muted'], 'middle', name='Nom')))
    x0 = 9 * 80
    parts.append(g('Fiche_chrono', rect(x0, y + 20, 64, 64, C['panel'], 14, name='Fond'), chrono('+', x0 + 14, y + 34, size=36), text(x0 + 32, y + 100, 'chrono', 11, 400, C['muted'], 'middle', name='Nom')))
    parts.append(g('Fiche_portee', rect(x0 + 80, y + 20, 64, 64, C['panel'], 14, name='Fond'), staff_icon(x0 + 80 + 15, y + 40), text(x0 + 112, y + 100, 'portée', 11, 400, C['muted'], 'middle', name='Nom')))
    return svg(1000, y + 240, *parts)


def svg(w, h, *kids):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">' + ''.join(kids) + '</svg>\n')


def page(titles_frames):
    """Écrans côte à côte, avec un titre au-dessus de chacun."""
    kids, x, hmax = [], 0, 0
    for title, fr, h in titles_frames:
        kids.append(g('Page_' + title, text(0, -14, title, 18, 700, C['text'], name='Titre_ecran'), fr, tr=f'translate({x} 60)'))
        x += W + 60
        hmax = max(hmax, h)
    return svg(x, hmax + 80, *kids)


def main():
    os.makedirs(OUT, exist_ok=True)
    def write(name, content):
        with open(os.path.join(OUT, name), 'w', encoding='utf-8') as f:
            f.write(content)
        print('écrit', os.path.join('design', 'figma', name))
    write('page-00-styles.svg', page_styles())
    write('page-01-onglets.svg', page([('01 · Morceaux (bibliothèque)', ecran_morceaux(), 800), ('02 · Solos (onglet)', ecran_solos(), 800),
                                       ('03 · Morceau : lecteur allégé et liste des solos', ecran_morceau('replie'), 800),
                                       ('04 · Morceau : lecteur complet', ecran_morceau('complet'), 800), ('05 · Morceau : solo déplié', ecran_morceau('deplie'), 1110)]))
    write('page-02-details-solo.svg', page([('01 · Détails du solo : plage et partition', ecran_details(False), 800), ('02 · Détails du solo : réglages ouverts', ecran_details(True), 800)]))


if __name__ == '__main__':
    main()
