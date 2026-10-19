"""สร้างข้อมูลจำลอง (synthetic) ให้มีโครงสร้างเหมือนข้อมูลนัดทันตกรรมจาก JHCIS
ตัวแปรจัดตามกรอบ Andersen  -  ใช้เพื่อพัฒนา/ทดสอบ pipeline ก่อนได้ข้อมูลจริง
เมื่อได้ข้อมูลจริง ให้ส่งออกเป็น CSV คอลัมน์ชื่อเดียวกัน แล้วข้าม script นี้ได้เลย"""
import numpy as np, pandas as pd

def generate(n_patients=900, seed=42):
    rng = np.random.default_rng(seed)
    pts = pd.DataFrame({
        "patient_id": np.arange(1, n_patients + 1),
        "age": np.clip(rng.normal(70, 7, n_patients), 60, 95).round().astype(int),
        "sex": rng.choice(["F", "M"], n_patients, p=[.58, .42]),
        "marital": rng.choice(["married", "widowed", "single"], n_patients, p=[.55, .35, .10]),
        "education": rng.choice(["primary", "secondary", "higher"], n_patients, p=[.72, .20, .08]),
        "occupation": rng.choice(["agri", "labor", "retired", "trade"], n_patients, p=[.30, .15, .40, .15]),
        "scheme": rng.choice(["UC", "civil", "social"], n_patients, p=[.80, .12, .08]),
        "distance_km": np.round(rng.gamma(2.0, 2.2, n_patients), 1),
        "has_caregiver": rng.choice([0, 1], n_patients, p=[.45, .55]),
        "has_phone": rng.choice([0, 1], n_patients, p=[.15, .85]),
        "chronic_disease": rng.choice([0, 1], n_patients, p=[.35, .65]),
    })
    pts["propensity"] = rng.normal(0, .8, n_patients)  # พฤติกรรมแฝงของผู้ป่วยแต่ละคน
    rows = []
    start = pd.Timestamp("2023-01-01"); end = pd.Timestamp("2025-12-31")
    days = (end - start).days
    for _, p in pts.iterrows():
        k = rng.poisson(3.2) + 1
        dates = np.sort(start + pd.to_timedelta(rng.integers(0, days, k), unit="D"))
        n_app = n_ns = 0
        for d in dates:
            d = pd.Timestamp(d)
            lead = int(rng.choice([3, 7, 14, 21, 30, 45]))
            proc = rng.choice(["scaling", "extraction", "filling", "denture", "perio"],
                              p=[.30, .15, .20, .15, .20])
            hist_rate = n_ns / n_app if n_app else 0.0
            z = (-2.35 + p.propensity + 0.045*(p.distance_km - 4) - 0.55*p.has_caregiver
                 - 0.30*p.has_phone + 0.012*lead + 1.6*hist_rate + 0.25*(n_ns >= 1)
                 + (0.35 if d.dayofweek == 0 else 0)
                 + {"scaling":.15,"extraction":-.35,"filling":.0,"denture":.2,"perio":-.1}[proc]
                 + 0.02*(p.age-70) + (0.2 if p.education == "primary" else 0))
            ns = int(rng.random() < 1/(1+np.exp(-z)))
            rows.append(dict(patient_id=p.patient_id, appt_date=d, lead_days=lead, procedure=proc,
                             dow=d.dayofweek, period=rng.choice(["morning","afternoon"], p=[.7,.3]),
                             prior_appts=n_app, prior_noshows=n_ns, prior_noshow_rate=round(hist_rate,3),
                             no_show=ns))
            n_app += 1; n_ns += ns
    df = pd.DataFrame(rows).merge(pts.drop(columns="propensity"), on="patient_id")
    return df.sort_values("appt_date").reset_index(drop=True)

if __name__ == "__main__":
    df = generate(); df.to_csv("synthetic_appointments.csv", index=False)
    print(df.shape, "no-show rate: %.1f%%" % (100*df.no_show.mean()))
    print(df.groupby(df.appt_date.dt.year).no_show.agg(["size","mean"]))
