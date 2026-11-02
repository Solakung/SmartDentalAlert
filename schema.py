"""ข้อกำหนดคอลัมน์ CSV (ตรงกับภาคผนวก ก) ใช้ร่วมกันโดย validate_csv.py, score_new.py, train_model.py"""
import re
import pandas as pd

ENUMS = {"period": {"morning", "afternoon"}, "sex": {"F", "M"}, "marital": {"married", "widowed", "single", "divorced"},
         "scheme": {"UC", "civil", "social"}, "procedure": {"scaling", "extraction", "filling", "denture"}}
PROC_TH = {"scaling": "ขูดหินปูน", "extraction": "ถอนฟัน", "filling": "อุดฟัน", "denture": "ฟันเทียม"}
RANGES = {"age": (60, 110), "lead_days": (0, 365), "distance_km": (0, 200), "chronic_disease": (0, 1), "continuing_care": (0, 1), "no_show": (0, 1),
          "prior_appts": (0, 500), "prior_noshows": (0, 500)}
# จำเป็นเสมอ (prior_noshow_rate และ dow คำนวณให้เองได้)
REQUIRED = ["patient_id", "appt_date", "period", "procedure", "age", "sex", "marital", "scheme", "distance_km",
            "chronic_disease", "continuing_care", "lead_days", "prior_appts", "prior_noshows"]
ID_RE = re.compile(r"^P?\d{3,6}$", re.I)
KNOWN_OK = {"has_phone", "has_caregiver"}   # ธง 0/1 ในชุดขยาย ไม่ใช่เบอร์โทร
PII_HINTS = ("name", "ชื่อ", "cid", "id_card", "idcard", "citizen", "เลขบัตร", "phone", "tel", "โทร", "address", "ที่อยู่", "hn")

def derive(df):
    """เติมคอลัมน์ที่คำนวณได้ หากยังไม่มี"""
    df = df.copy(); d = pd.to_datetime(df["appt_date"], errors="coerce")
    if "dow" not in df: df["dow"] = d.dt.dayofweek
    if "prior_noshow_rate" not in df:
        df["prior_noshow_rate"] = (pd.to_numeric(df["prior_noshows"], errors="coerce") / pd.to_numeric(df["prior_appts"], errors="coerce").replace(0, pd.NA)).fillna(0).round(3)
    return df

def validate(df, training):
    """คืน (errors, warnings) เป็นรายการข้อความ"""
    E, W = [], []
    need = REQUIRED + (["no_show"] if training else [])
    miss = [c for c in need if c not in df.columns]
    if miss: return [f"ขาดคอลัมน์: {', '.join(miss)}"], W
    pii = [c for c in df.columns if c not in KNOWN_OK and any(h in c.lower() for h in PII_HINTS)]
    if pii: E.append(f"พบคอลัมน์ที่อาจเป็นข้อมูลระบุตัวตน: {', '.join(pii)} (ให้ลบก่อนใช้ไฟล์นี้)")
    bad = df[~df["patient_id"].astype(str).str.match(ID_RE)]
    if len(bad): E.append(f"patient_id ไม่ใช่รหัสวิจัย (เช่น P0123) {len(bad)} แถว เช่นแถว {bad.index[0] + 2}")
    d = pd.to_datetime(df["appt_date"], errors="coerce")
    if d.isna().any(): E.append(f"appt_date อ่านไม่ได้ {int(d.isna().sum())} แถว (ใช้ ปปปป-ดด-วว แบบ ค.ศ.)")
    for c, vals in ENUMS.items():
        x = df[~df[c].isin(vals)]
        if len(x): E.append(f"{c}: ค่าไม่อยู่ในชุดที่กำหนด {sorted(vals)} จำนวน {len(x)} แถว เช่น '{x[c].iloc[0]}'")
    for c, (lo, hi) in RANGES.items():
        if c not in df: continue
        v = pd.to_numeric(df[c], errors="coerce")
        n_na = int(v.isna().sum()); n_out = int(((v < lo) | (v > hi)).sum())
        if n_na: E.append(f"{c}: ว่างหรือไม่ใช่ตัวเลข {n_na} แถว")
        if n_out: E.append(f"{c}: อยู่นอกช่วง {lo}–{hi} จำนวน {n_out} แถว")
    if (pd.to_numeric(df["prior_noshows"], errors="coerce") > pd.to_numeric(df["prior_appts"], errors="coerce")).any():
        E.append("prior_noshows มากกว่า prior_appts ในบางแถว")
    dup = df.duplicated(["patient_id", "appt_date"]).sum()
    if dup: W.append(f"มีนัดซ้ำ (patient_id + appt_date เดียวกัน) {int(dup)} แถว")
    if training and "no_show" in df:
        r = pd.to_numeric(df["no_show"], errors="coerce").mean()
        W.append(f"อัตราขาดนัดรวม {r:.1%} จาก {len(df)} นัด" + (" (ต่ำมาก ควรตรวจนิยาม 'ขาดนัด')" if r < 0.03 else ""))
        if len(df) < 500: W.append("จำนวนนัดน้อยกว่า 500 โมเดลอาจไม่เสถียร")
    return E, W
