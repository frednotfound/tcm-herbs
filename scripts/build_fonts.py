#!/usr/bin/env python3
"""把思源宋體（Noto Serif CJK TC，SIL OFL 授權）切成網站用得到的字，輸出 fonts/*.woff 與 fonts/fonts.css。

為什麼要切：完整字型一個字重就有十幾 MB；只留網站資料用到的字（約 2,500 字）並依使用頻率分成幾片，
瀏覽器只下載目前頁面用到的那幾片（CSS unicode-range）。

什麼時候要重跑：資料裡新增了沒出現過的字（node scripts/validate.mjs 會提醒「字型沒有收錄的字」）。
用法（需要 Python 3 與 fontTools：pip install fonttools）：
    python3 scripts/build_fonts.py  /路徑/NotoSerifCJK-Regular.ttc  /路徑/NotoSerifCJK-Bold.ttc
字型檔可從 https://github.com/notofonts/noto-cjk/releases 下載（Serif 的 .ttc 或 TC 的 .otf 皆可）。
"""
import collections, glob, os, sys
from fontTools.ttLib import TTCollection, TTFont
from fontTools import subset

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'fonts')
FAMILY = 'TCM Serif'
FIRST_SLICE = 900      # 第一片：介面用字＋最常用的字（幾乎每頁都會用到）
SLICE = 450            # 其餘每片字數
EXTRA = '，。、；：？！「」『』（）《》〈〉—…·・／～％＋－＝×÷°±→←↑↓↗‹›★①②③④⑤αβγδωκ　'

def load_face(path):
    if path.lower().endswith('.ttc'):
        col = TTCollection(path)
        for f in col.fonts:  # 找繁體中文（TC）那一個
            if ' TC' in (f['name'].getDebugName(1) or ''):
                return f
        return col.fonts[0]
    return TTFont(path)

def char_frequency():
    cnt = collections.Counter()
    files = glob.glob(os.path.join(ROOT, 'data/**/*.json'), recursive=True)
    for f in files:
        cnt.update(open(f, encoding='utf8').read())
    ui = collections.Counter()
    for f in glob.glob(os.path.join(ROOT, 'js/**/*.js'), recursive=True) + [os.path.join(ROOT, 'index.html'), os.path.join(ROOT, 'manifest.webmanifest')]:
        ui.update(open(f, encoding='utf8').read())
    return cnt, ui

def ranges(cps):
    cps = sorted(cps); out = []; i = 0
    while i < len(cps):
        j = i
        while j + 1 < len(cps) and cps[j + 1] == cps[j] + 1: j += 1
        out.append(f'U+{cps[i]:X}' if i == j else f'U+{cps[i]:X}-{cps[j]:X}')
        i = j + 1
    return ', '.join(out)

def main(regular, bold):
    data, ui = char_frequency()
    basic = {chr(i) for i in range(0x20, 0x7F)} | set(EXTRA)
    allchars = {c for c in (set(data) | set(ui) | basic) if c.isprintable() or c == '　'}
    face = load_face(regular)
    have = set(chr(u) for u in face.getBestCmap())
    allchars &= have
    # 第一片：ASCII、標點、介面上的字，再補最常用的字到 FIRST_SLICE
    first = (basic | {c for c in ui if ord(c) > 0x7F}) & allchars
    rest = sorted(allchars - first, key=lambda c: (-(data[c] + ui[c]), ord(c)))
    while len(first) < FIRST_SLICE and rest: first.add(rest.pop(0))
    slices = [first] + [set(rest[i:i + SLICE]) for i in range(0, len(rest), SLICE)]

    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, '*.woff')): os.remove(f)
    css = ['/* 由 scripts/build_fonts.py 產生，請勿手動修改。字型：Noto Serif CJK TC（思源宋體），SIL Open Font License 1.1，見 fonts/OFL.txt */']
    for weight, path in ((400, regular), (700, bold)):
        for i, chars in enumerate(slices):
            f = load_face(path)
            opts = subset.Options()
            opts.flavor = 'woff'
            opts.layout_features = ['kern', 'liga', 'palt', 'locl']
            opts.name_IDs = ['*']; opts.name_languages = ['*']
            opts.notdef_outline = True; opts.hinting = False
            s = subset.Subsetter(opts); s.populate(text=''.join(chars)); s.subset(f)
            name = f'serif-{weight}-{i}.woff'
            f.flavor = 'woff'; f.save(os.path.join(OUT, name))
            css.append('@font-face { font-family: "%s"; font-style: normal; font-weight: %d; font-display: swap;\n  src: url("%s") format("woff");\n  unicode-range: %s; }'
                       % (FAMILY, weight, name, ranges(ord(c) for c in chars)))
            print(name, len(chars), '字', os.path.getsize(os.path.join(OUT, name)) // 1024, 'KB')
    open(os.path.join(OUT, 'fonts.css'), 'w', encoding='utf8').write('\n'.join(css) + '\n')
    print('共', len(allchars), '字，', len(slices), '片／字重')

if __name__ == '__main__':
    if len(sys.argv) != 3:
        print(__doc__); sys.exit(1)
    main(sys.argv[1], sys.argv[2])
