"""ให้คะแนนความเสี่ยงนัดล่วงหน้า แล้วออกไฟล์รูปแบบที่นำเข้าหน้าแอดมินได้
ใช้: python3 score_new.py upcoming.csv [--history ประวัติ.csv] [-o scored_for_import.csv]
ต้องมี model.joblib จาก train_model.py (ฝึกด้วยข้อมูลของหน่วยบริการนั้นเอง)
--history: คำนวณ prior_appts/prior_noshows จากประวัติให้ (คอลัมน์ patient_id, appt_date, no_show)"""
import sys, argparse, joblib, pandas as pd
from schema import validate, derive, PROC_TH, ENUMS
ap = argparse.ArgumentParser(); ap.add_argument("upcoming"); ap.add_argument("--history"); ap.add_argument("-o", "--out", default="scored_for_import.csv")
a = ap.parse_args()
df = pd.read_csv(a.upcoming, dtype={"patient_id": str}); df["appt_date"] = pd.to_datetime(df["appt_date"], errors="coerce")
if a.history:
    h = pd.read_csv(a.history, dtype={"patient_id": str}, parse_dates=["appt_date"])[["patient_id", "appt_date", "no_show"]]
    def prior(r):
        x = h[(h.patient_id == r.patient_id) & (h.appt_date < r.appt_date)]
        return pd.Series({"prior_appts": len(x), "prior_noshows": int(x.no_show.sum())})
    df[["prior_appts", "prior_noshows"]] = df.apply(prior, axis=1)
E, W = validate(df, training=False)
for w in W: print("[คำเตือน]", w)
if E: sys.exit("ไฟล์ไม่ผ่านการตรวจ:\n  " + "\n  ".join(E))
df = derive(df); df["out_area"] = (df.distance_km > 8).astype(int)
m = joblib.load("model.joblib"); X = pd.get_dummies(df, columns=list(ENUMS), dtype=float).reindex(columns=m["features"], fill_value=0.0)
p = m["model"].predict_proba(X.values)[:, 1]; cut = m["cutoffs"]
out = pd.DataFrame({"patient_id": df.patient_id, "appt_date": df.appt_date.dt.strftime("%Y-%m-%d"), "period": df.period,
                    "procedure": df["procedure"].map(PROC_TH), "age": df.age, "sex": df.sex, "risk_score": (p * 100).round().astype(int)})
out.to_csv(a.out, index=False)
lv = pd.cut(p, [-1, cut["low_below"], cut["high_from"] - 1e-9, 2], labels=["low", "medium", "high"])
print(f"บันทึก {a.out}: {len(out)} นัด  ต่ำ {int((lv=='low').sum())} · กลาง {int((lv=='medium').sum())} · สูง {int((lv=='high').sum())}")
print("จุดตัดจากโมเดล: ต่ำ <", round(cut["low_below"] * 100), " สูง ≥", round(cut["high_from"] * 100), "(ตั้งในหน้าแอดมินให้ตรงกัน)")
