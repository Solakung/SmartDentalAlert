"""สร้าง docs/index.html (ภาพจำลองระบบ) จากผล train_model.py: นัดตัวอย่าง 1 สัปดาห์ของปี 2568"""
import pandas as pd, json
t = pd.read_csv("test_predictions.csv", parse_dates=["appt_date"]); res = json.load(open("results.json"))
t["week"] = t.appt_date.dt.isocalendar().week
wk = t.groupby("week").size(); big = wk[wk >= 18]
w = int(big.index[len(big)//2]) if len(big) else int(wk.idxmax()); s = t[t.week == w]
PM = {"scaling":"ขูดหินปูน","extraction":"ถอนฟัน","filling":"อุดฟัน","denture":"ฟันเทียม","perio":"รักษาปริทันต์"}
def reasons(r):  # ใช้เฉพาะตัวแปรตามภาคผนวก ก
    o = []
    if r.prior_noshows >= 1: o.append(f"เคยขาดนัด {int(r.prior_noshows)} ครั้ง จาก {int(r.prior_appts)} นัด")
    if r.distance_km > 8: o.append("ที่พักอยู่นอกเขต รพ.สต.")
    if r.lead_days >= 30: o.append(f"นัดล่วงหน้านาน {int(r.lead_days)} วัน")
    if r.dow == 0: o.append("นัดวันจันทร์")
    return o
MS = {"married":"สมรส","widowed":"หม้าย","single":"โสด"}; SC = {"UC":"บัตรทอง","civil":"ข้าราชการ","social":"ประกันสังคม"}
rows = [dict(id=f"P{int(r.patient_id):04d}", date=r.appt_date.strftime("%Y-%m-%d"), period=r.period, age=int(r.age), sex=r.sex,
             proc=PM[r["procedure"]], outArea=int(r.distance_km > 8), scheme=SC[r.scheme], marital=MS[r.marital], lead=int(r.lead_days),
             prior=int(r.prior_appts), priorNs=int(r.prior_noshows), p=float(r.risk_prob), level=r.risk_level, reasons=reasons(r))
        for _, r in s.sort_values(["appt_date","period"]).iterrows()]
data = dict(appts=rows, cut=res["risk_cutoffs"], metrics=res["models"]["RF + SMOTE (ตามโครงร่าง)"], risk=res["risk_table"], n=res["n"],
            imp=[dict(f=d["feature"], g=d["gini"], pm=d["permutation_auc_drop"], grp=d["andersen_group"]) for d in res["importance"]])
html = open("mockup_template.html").read().replace("__DATA__", json.dumps(data, ensure_ascii=False))
open("docs/index.html", "w").write(html); print(len(rows), "appointments, week", w)
