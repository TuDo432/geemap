"""Bản đồ bố cục kiểu ArcGIS: tiêu đề, khung, lưới tọa độ, la bàn, thước tỷ lệ, chú giải."""
import io, math
import numpy as np
import matplotlib
import matplotlib.patheffects as pe
from matplotlib.figure import Figure
from matplotlib.image import imread
from matplotlib.patches import Rectangle, Polygon as MPoly, PathPatch
from matplotlib.path import Path
from matplotlib.colors import LinearSegmentedColormap
from shapely.geometry import shape
from . import gee_service as g

matplotlib.rcParams["font.family"] = "DejaVu Sans"       # hỗ trợ tiếng Việt có dấu

TITLES = {"LST": "BẢN ĐỒ NHIỆT ĐỘ BỀ MẶT (LST)",
          "NDVI": "BẢN ĐỒ CHỈ SỐ THỰC VẬT (NDVI)",
          "TVDI": "BẢN ĐỒ CHỈ SỐ KHÔ HẠN (TVDI)"}
UNITS = {"LST": " (°C)", "NDVI": "", "TVDI": ""}

# NDVI chưa có bảng phân cấp trong CSDL nên dùng thang mặc định
NDVI_CLASSES = [
    dict(lo=-1.0, hi=0.1, name="Rất thấp (đất trống, nước)", color="#d73027"),
    dict(lo=0.1,  hi=0.2, name="Thấp",       color="#fdae61"),
    dict(lo=0.2,  hi=0.4, name="Trung bình", color="#fee08b"),
    dict(lo=0.4,  hi=0.6, name="Cao",        color="#a6d96a"),
    dict(lo=0.6,  hi=1.0, name="Rất cao",    color="#1a9850"),
]

# ---------- tiện ích hình học ----------
def _polys(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return geom["coordinates"] if geom["type"] == "MultiPolygon" else []

def _path(geom):
    v, c = [], []
    for poly in _polys(geom):
        for ring in poly:
            v += [(p[0], p[1]) for p in ring]
            c += [Path.MOVETO] + [Path.LINETO] * (len(ring) - 2) + [Path.CLOSEPOLY]
    return Path(v, c)

def _lines(ax, feats, lw, color, z):
    for f in feats:
        for poly in _polys(f["geometry"]):
            for ring in poly:
                ax.plot([p[0] for p in ring], [p[1] for p in ring], color=color, lw=lw,
                        zorder=z, solid_joinstyle="round")

def _dms(v, pos, neg):
    h, v = (pos if v >= 0 else neg), abs(v)
    d, m = int(v), int(round((v - int(v)) * 60))
    if m == 60: d, m = d + 1, 0
    return f"{d}°{m:02d}'{h}"

def _ticks(a, b, span):
    step = next((m / 60 for m in (2, 5, 10, 15, 20, 30, 60) if span / (m / 60) <= 5), 1.0)
    return [k * step for k in range(math.ceil(a / step), math.floor(b / step) + 1)]

# ---------- thành phần bản đồ ----------
def _north_arrow(fig, W, H):
    na = fig.add_axes([(W - 1.7) / W, (H - 1.35) / H, 0.9 / W, 0.9 / H])
    na.set_xlim(-1.6, 1.6); na.set_ylim(-1.6, 1.6); na.set_aspect("equal"); na.axis("off")
    na.plot([-1, 1], [0, 0], "k", lw=.5); na.plot([0, 0], [-1, 1], "k", lw=.5)
    na.add_patch(MPoly([(0, 1), (-.3, -.35), (0, -.1)], fc="k", ec="k", lw=.7))
    na.add_patch(MPoly([(0, 1), (.3, -.35), (0, -.1)], fc="white", ec="k", lw=.7))
    for t, x, y in (("N", 0, 1.35), ("S", 0, -1.35), ("W", -1.35, 0), ("E", 1.35, 0)):
        na.text(x, y, t, ha="center", va="center", fontsize=8, fontweight="bold")

def _scalebar(ax, k):
    x0, x1 = ax.get_xlim(); y0, y1 = ax.get_ylim()
    kmdeg = 111.32 * k                                   # km trên 1° kinh độ tại vĩ độ giữa
    target = (x1 - x0) * kmdeg / 4
    L = max([n for n in (1, 2, 5, 10, 20, 25, 50, 100) if n <= target] or [1])
    seg, hh = L / 4 / kmdeg, (y1 - y0) * 0.009
    bx, by = x0 + (x1 - x0) * 0.04, y0 + (y1 - y0) * 0.05
    ax.add_patch(Rectangle((bx - seg * .4, by - hh * 2.2), seg * 4.9, hh * 6.5,
                           fc="white", ec="none", alpha=.85, zorder=11))
    for i in range(4):
        ax.add_patch(Rectangle((bx + i * seg, by), seg, hh, fc="k" if i % 2 == 0 else "white",
                               ec="k", lw=.6, zorder=12))
    for i, lab in ((0, "0"), (2, f"{L/2:g}"), (4, f"{L:g} km")):
        ax.text(bx + i * seg, by + hh * 1.6, lab, ha="center", va="bottom", fontsize=7, zorder=12)

def _legend(fig, W, H, index, classes, vis, right_in, legend_h_in=None):
    unit = UNITS[index]
    if classes:
        n = len(classes); cols = 1 if n <= 5 else 2; rows = math.ceil(n / cols)
        w, h = (2.6 if cols == 1 else 3.9), 0.4 + rows * 0.2
        ax = fig.add_axes([(right_in - w) / W, 0.2 / H, w / W, h / H])
        ax.set_xlim(0, 1); ax.set_ylim(0, rows + 1); ax.set_xticks([]); ax.set_yticks([])
        ax.text(0.03, rows + 0.45, f"Chú giải · {index}{unit}", fontsize=8, fontweight="bold", va="center")
        for i, c in enumerate(classes):
            col, r = divmod(i, rows); x = col / cols + 0.03; y = rows - r - 0.5
            ax.add_patch(Rectangle((x, y - .3), 0.05 / cols * 1.6, .6, fc=c["color"], ec="k", lw=.4))
            rng = (f"< {c['hi']:g}" if i == 0 else f"≥ {c['lo']:g}" if i == n - 1
                   else f"{c['lo']:g} – {c['hi']:g}")
            ax.text(x + 0.07 / cols * 1.6 + 0.01, y, f"{c['name']}: {rng}", fontsize=6.5, va="center")
    else:
        w, h = 3.0, 0.9
        ax = fig.add_axes([(right_in - w) / W, 0.2 / H, w / W, h / H])
        ax.set_xticks([]); ax.set_yticks([]); ax.set_xlim(0, 1); ax.set_ylim(0, 1)
        ax.text(0.04, 0.82, f"Chú giải · {index}{unit}", fontsize=8, fontweight="bold", va="center")
        gax = fig.add_axes([(right_in - w + 0.2) / W, 0.45 / H, (w - 0.4) / W, 0.2 / H])
        cmap = LinearSegmentedColormap.from_list("v", vis["palette"])
        gax.imshow(np.linspace(0, 1, 256)[None, :], cmap=cmap, aspect="auto",
                   extent=[vis["min"], vis["max"], 0, 1])
        gax.set_yticks([]); gax.tick_params(labelsize=7, length=3)
    for s in ax.spines.values(): s.set_linewidth(.9)

# ---------- hàm chính ----------
def render(index, year, cloud=30, classes=None, region="all", fmt="png", dpi=200):
    cls = [dict(c) for c in (classes or [])]
    show = [(c["lo"], c["hi"], c["color"]) for c in cls] or None
    png, vis, bbox = g.snapshot_png(index, year, cloud, show, size=2400)
    img = imread(io.BytesIO(png), format="png")
    bx0, by0, bx1, by1 = map(float, bbox.split(","))

    reg = g.region_stats(year, cloud)                       # đã cache 2 giờ
    prov, dist, sel = reg["provinces"]["features"], reg["districts"]["features"], None
    if region != "all":
        sel = next((f for f in prov if f["properties"]["zone"] == region), None)
        if sel is None:
            raise ValueError(f"Không có vùng: {region}")
        x0, y0, x1, y1 = shape(sel["geometry"]).bounds
        prov, dist = [sel], [f for f in dist if f["properties"]["zone"] == region]
    else:
        x0, y0, x1, y1 = bx0, by0, bx1, by1
    px, py = (x1 - x0) * .04, (y1 - y0) * .04
    x0, x1, y0, y1 = x0 - px, x1 + px, y0 - py, y1 + py

    k = math.cos(math.radians((y0 + y1) / 2))
    r = (y1 - y0) / ((x1 - x0) * k)                         # tỉ lệ cao/rộng thực của bản đồ
    Wm = 7.0 if 7.0 * r <= 9 else 9 / r
    Hm = Wm * r
    W, H = max(Wm + 1.8, 8.2), Hm + 3.4
    L, B = (W - Wm) / 2, 1.9

    fig = Figure(figsize=(W, H), facecolor="white")
    ax = fig.add_axes([L / W, B / H, Wm / W, Hm / H])
    im = ax.imshow(img, extent=(bx0, bx1, by0, by1), origin="upper",
                   aspect="auto", interpolation="nearest", zorder=1)
    if sel:
        im.set_clip_path(PathPatch(_path(sel["geometry"]), transform=ax.transData))
    _lines(ax, dist, .45, "#222222", 5)
    _lines(ax, prov, 1.3, "black", 6)

    halo = [pe.withStroke(linewidth=1.8, foreground="white")]
    for f in (dist if sel else prov):                       # nhãn tên đơn vị hành chính
        p = shape(f["geometry"]).representative_point()
        ax.text(p.x, p.y, f["properties"]["name"], fontsize=6 if sel else 8, color="#9b1c1c",
                ha="center", va="center", zorder=8, path_effects=halo)

    ax.set_xlim(x0, x1); ax.set_ylim(y0, y1); ax.set_aspect(1 / k)

    # lưới tọa độ: dấu + tại giao điểm, nhãn độ-phút ở 4 cạnh
    xt, yt = _ticks(x0, x1, x1 - x0), _ticks(y0, y1, y1 - y0)
    if xt and yt:
        X, Y = np.meshgrid(xt, yt)
        ax.scatter(X.ravel(), Y.ravel(), marker="+", s=45, c="k", linewidths=.6, zorder=10)
    ax.set_xticks(xt); ax.set_yticks(yt)
    ax.set_xticklabels([_dms(v, "E", "W") for v in xt]); ax.set_yticklabels([_dms(v, "N", "S") for v in yt])
    ax.tick_params(axis="both", length=3, width=.6, labelsize=6.5,
                   top=True, right=True, labeltop=True, labelright=True)
    ax.tick_params(axis="y", labelrotation=90)
    for t in ax.yaxis.get_major_ticks():
        t.label1.set_va("center"); t.label2.set_va("center")
    for s in ax.spines.values(): s.set_linewidth(1.1)
    _scalebar(ax, k)

    # tiêu đề, la bàn, chú giải, ghi chú, khung viền
    where = "TP. HỒ CHÍ MINH (SAU SÁP NHẬP)" if region == "all" else region.upper()
    fig.text(.5, (H - .65) / H, f"{TITLES[index]}\nMÙA KHÔ {year} · {where}", ha="center", va="center",
             fontsize=15, fontweight="bold", color="#0d3b8c", linespacing=1.35)
    _north_arrow(fig, W, H)
    _legend(fig, W, H, index, cls, vis, W - L)
    fig.text(L / W, .5 / H,
             f"Nguồn: Landsat 8/9 Collection 2 Level-2 (USGS) xử lý trên Google Earth Engine\n"
             f"Ảnh ghép median mùa khô 12/{year-1}–04/{year}, mây < {cloud}%\n"
             f"Hệ tọa độ: WGS84 (EPSG:4326) · Ranh giới: FAO GAUL 2015",
             fontsize=6.5, va="bottom", color="#333", linespacing=1.5)
    fig.add_artist(Rectangle((.012, .008), .976, .984, transform=fig.transFigure,
                             fill=False, ec="k", lw=1.6))
    buf = io.BytesIO()
    fig.savefig(buf, format=fmt, dpi=dpi)
    return buf.getvalue()