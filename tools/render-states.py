"""Render a 3-state illustration of the draft-meter plugin.

This is NOT a screenshot: the real UI cannot be captured here (no browser
control, and the /plugins route needs the page's authenticated carrier).
Every geometry and colour below is transcribed from draft-meter/client.js
and the shipped ContextMeter/InputBar CSS so the picture matches what the
plugin actually renders.
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1420, 1500
BG = "#F4F5F7"
CARD = "#FFFFFF"
BORDER = "#E4E7EC"
INK = "#1F2328"
SUB = "#6B7280"
FAINT = "#9CA3AF"
BLUE = "#5B8DEF"
SEP = "#C6D2E6"

img = Image.new("RGB", (W, H), BG)
d = ImageDraw.Draw(img)


def F(sz, bold=False):
    path = "C:/Windows/Fonts/msyhbd.ttc" if bold else "C:/Windows/Fonts/msyh.ttc"
    return ImageFont.truetype(path, sz)


f_title = F(30, True)
f_tag = F(24, True)
f_lab = F(25, True)
f_note = F(23)
f_tiny = F(19)
f_body = F(27)
f_dock = F(25)
f_row = F(23)
f_hdr = F(24, True)

CX0, CX1 = 60, 1000
DRAFT = "帮我改一下这个函数的命名，让它更清楚"


def shadow(box, radius, alpha=26, blur=20, dy=8):
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    b = (box[0] - 6, box[1] - 6 + dy, box[2] + 6, box[3] + 6 + dy)
    ld.rounded_rectangle(b, radius=radius, fill=(15, 23, 42, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.paste(layer, (0, 0), layer)


def composer(top, height=176, draft=None, placeholder=None):
    box = (CX0, top, CX1, top + height)
    shadow(box, 28)
    d.rounded_rectangle(box, radius=28, fill=CARD, outline=BORDER, width=2)
    x0, y0, x1, y1 = box
    if draft:
        d.text((x0 + 40, y0 + 34), draft, font=f_body, fill=INK)
    elif placeholder:
        d.text((x0 + 40, y0 + 34), placeholder, font=f_body, fill=FAINT)
    ty = y1 - 52
    text = "DeepSeek V4.1 Flash"
    pill_w = d.textlength(text, font=f_row) + 34
    d.rounded_rectangle((x0 + 30, ty - 15, x0 + 30 + pill_w, ty + 15),
                        radius=15, outline=BORDER, width=2)
    d.text((x0 + 47, ty), text, font=f_row, fill=SUB, anchor="lm")
    cx, cy = x1 - 46, ty
    d.ellipse((cx - 16, cy - 16, cx + 16, cy + 16), fill="#DCE3EE")
    d.line((cx, cy + 7, cx, cy - 6), fill="#FFFFFF", width=3)
    d.line((cx - 6, cy - 1, cx, cy - 7), fill="#FFFFFF", width=3)
    d.line((cx + 6, cy - 1, cx, cy - 7), fill="#FFFFFF", width=3)
    return box


def reading(cy, left="草稿 18 字", right="≈12 token"):
    """The 14px three-bar glyph + '草稿 18 字' + dot + '≈12 token', centred."""
    w_l = d.textlength(left, font=f_dock)
    w_r = d.textlength(right, font=f_dock)
    total = 28 + 10 + w_l + 22 + w_r
    x = (CX0 + CX1) / 2 - total / 2
    # 14x14 glyph at 2x: three ascending rounded bars in currentColor
    for bx, bh, blend in ((0, 7, 0.35), (9, 11, 0.18), (18, 15, 1.0)):
        col = tuple(round(c * (1 - blend) + 0x9C * blend) for c in (0xC7, 0xCD, 0xD6))
        d.rounded_rectangle((x + bx, cy + 15 - bh, x + bx + 6, cy + 15),
                            radius=2.5, fill=col)
    x += 28 + 10
    d.text((x, cy), left, font=f_dock, fill=FAINT, anchor="lm")
    x += w_l + 11
    d.ellipse((x - 3.5, cy - 3.5, x + 3.5, cy + 3.5), fill=SEP)
    x += 11
    d.text((x, cy), right, font=f_dock, fill=FAINT, anchor="lm")
    return (CX0 + CX1) / 2 - total / 2, x + w_r


def label(y, n, text):
    d.ellipse((62, y - 16, 94, y + 16), fill=BLUE)
    d.text((78, y), n, font=f_tag, fill="#FFFFFF", anchor="mm")
    d.text((108, y), text, font=f_lab, fill=INK, anchor="lm")


def panel(box, rows, header, note):
    shadow(box, 32, alpha=48, blur=28, dy=12)
    d.rounded_rectangle(box, radius=32, fill="#FCFDFE", outline=BORDER, width=2)
    x0, y0, x1, y1 = box
    pad = 26
    d.text((x0 + pad, y0 + 32), header, font=f_hdr, fill=INK, anchor="lm")
    d.line((x0 + pad, y0 + 56, x1 - pad, y0 + 56), fill="#EDF0F4", width=2)
    y = y0 + 88
    for k, v in rows:
        d.text((x0 + pad, y), k, font=f_row, fill=SUB, anchor="lm")
        d.text((x1 - pad, y), v, font=f_row, fill=INK, anchor="rm")
        y += 40
    d.line((x0 + pad, y + 6, x1 - pad, y + 6), fill="#EDF0F4", width=2)
    d.text((x0 + pad, y + 34), note, font=f_tiny, fill=FAINT, anchor="lm")


def aside(x, y, head, lines):
    d.text((x, y), head, font=f_note, fill=INK, anchor="lm")
    for i, ln in enumerate(lines):
        d.text((x, y + 34 + i * 28), ln, font=f_tiny, fill=FAINT, anchor="lm")


# ---- header -------------------------------------------------------------
d.text((60, 46), "草稿统计 · 三种状态", font=f_title, fill=INK, anchor="lm")
d.text((W - 60, 46), "示意图 · 按 client.js 与 ContextMeter CSS 重绘，非截图",
       font=f_tiny, fill=FAINT, anchor="rm")

# ---- state 1: untouched input -------------------------------------------
label(120, "1", "还没打字")
composer(160, placeholder="输入消息…")
aside(1060, 214, "输入框下面什么都没有",
      ["插件不占任何高度，", "和没装过一样。"])

# ---- state 2: first keystroke -------------------------------------------
label(420, "2", "打第一个字")
b2 = composer(460, draft=DRAFT)
gy = 686
lx, rx = reading(gy)
d.rounded_rectangle((lx - 12, gy - 20, rx + 12, gy + 22),
                    radius=12, outline=BLUE, width=2)
aside(1060, 654, "这一行就是插件",
      ["字数随键盘实时变化；", "清空后它立刻消失。"])

# ---- state 3: panel open ------------------------------------------------
# The panel is position:fixed and anchored 8px above the reading, so it
# necessarily floats OVER the composer card. Draw that truthfully: the
# composer sits behind, the panel sits on top with its shadow.
label(800, "3", "点一下这一行")
CTOP = 980
b3 = composer(CTOP, draft=DRAFT)
gy3 = CTOP + 176 + 62
lx3, rx3 = reading(gy3)
PT_BOT = gy3 - 28
PT_TOP = PT_BOT - 268
PW = 544
PCX = (CX0 + CX1) / 2
panel((PCX - PW / 2, PT_TOP, PCX + PW / 2, PT_BOT),
      rows=[("行数", "1"),
            ("不含空格的字符数", "18"),
            ("CJK 字符", "17")],
      header="≈ 12 token",
      note="token 数按字符类型粗估，仅供参考。")
# pointer from the panel down to the reading line
mid = (lx3 + rx3) / 2
d.polygon([(mid - 12, PT_BOT - 2), (mid + 12, PT_BOT - 2), (mid, PT_BOT + 10)],
          fill="#FCFDFE")
d.line((mid - 12, PT_BOT - 2, mid, PT_BOT + 10), fill=BORDER, width=2)
d.line((mid + 12, PT_BOT - 2, mid, PT_BOT + 10), fill=BORDER, width=2)
aside(1060, 900, "展开看清细节",
      ["行数 / 不含空格字数 /",
       "CJK 字符数；",
       "写纯英文时多一栏",
       "「单词数」。"])
d.text((1060, 1050), "浮层是浮起来的，", font=f_tiny, fill=FAINT, anchor="lm")
d.text((1060, 1078), "会盖住输入框下半部分。", font=f_tiny, fill=FAINT, anchor="lm")

img = img.crop((0, 0, W, 1300))
img.save(r"C:\Users\jc\Documents\deepseek-harness\default-workspace\draft-meter\docs\states.png")
print("saved", img.size)
