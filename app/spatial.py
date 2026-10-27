"""Thống kê không gian trên lưới: Moran's I toàn cục và Getis-Ord Gi* (đề cương: Spatial Statistics)."""
import math

def _p(z):
    return 2 * (1 - 0.5 * (1 + math.erf(abs(z) / math.sqrt(2))))

def _nhom(z):
    if z >= 2.58: return "Điểm nóng 99%"
    if z >= 1.96: return "Điểm nóng 95%"
    if z >= 1.65: return "Điểm nóng 90%"
    if z <= -2.58: return "Điểm lạnh 99%"
    if z <= -1.96: return "Điểm lạnh 95%"
    if z <= -1.65: return "Điểm lạnh 90%"
    return "Không ý nghĩa"

def analyze(geojson):
    """geojson: kết quả reduceRegions trên lưới ô vuông (thuộc tính Code, mean). Láng giềng kiểu Queen, trọng số nhị phân."""
    cs = []
    for f in geojson["features"]:
        m = f["properties"].get("mean")
        if m is None: continue
        ring = f["geometry"]["coordinates"][0]
        xs, ys = [c[0] for c in ring], [c[1] for c in ring]
        cs.append((f["properties"].get("Code"), m, min(xs), min(ys), max(xs) - min(xs)))
    n = len(cs)
    if n < 10: return None
    step, x0, y0 = cs[0][4], min(c[2] for c in cs), min(c[3] for c in cs)
    key = [(round((c[2] - x0) / step), round((c[3] - y0) / step)) for c in cs]
    pos = {k: i for i, k in enumerate(key)}
    nb = [[pos[(ix + dx, iy + dy)] for dx in (-1, 0, 1) for dy in (-1, 0, 1)
           if (dx or dy) and (ix + dx, iy + dy) in pos] for ix, iy in key]
    x = [c[1] for c in cs]; mean = sum(x) / n; dev = [v - mean for v in x]
    s2, W = sum(d * d for d in dev), sum(len(a) for a in nb)
    if W == 0 or s2 == 0: return None
    I = (n / W) * sum(dev[i] * dev[j] for i, a in enumerate(nb) for j in a) / s2
    E = -1 / (n - 1)
    S1, S2 = 2 * W, 4 * sum(len(a) ** 2 for a in nb)          # ma trận trọng số đối xứng nhị phân
    var = (n * n * S1 - n * S2 + 3 * W * W) / (W * W * (n * n - 1)) - E * E
    z = (I - E) / math.sqrt(var)
    sd = math.sqrt(sum(v * v for v in x) / n - mean * mean)
    gi = {}
    for i, a in enumerate(nb):
        w = len(a) + 1
        den = sd * math.sqrt((n * w - w * w) / (n - 1))
        gz = (sum(x[j] for j in a) + x[i] - mean * w) / den if den else 0.0
        gi[cs[i][0]] = {"z": round(gz, 3), "nhom": _nhom(gz)}
    return {"moran": {"I": I, "E": E, "z": z, "p": _p(z), "n": n}, "gi": gi}