"""Pipeline ตามบทที่ 3: time-based split -> SMOTE (เฉพาะ train) -> Random Forest
-> ประเมินบน test -> feature importance -> จุดตัดความเสี่ยง 3 ระดับจาก validation
ใช้: python3 train_model.py [ไฟล์.csv]"""
import sys, json, warnings
import numpy as np, pandas as pd, joblib
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import make_pipeline
from sklearn.neighbors import NearestNeighbors
from sklearn.inspection import permutation_importance
from sklearn.metrics import (accuracy_score, precision_score, recall_score, f1_score,
                             roc_auc_score, average_precision_score, brier_score_loss,
                             confusion_matrix, precision_recall_curve)
warnings.filterwarnings("ignore")
SEED = 42
CSV = sys.argv[1] if len(sys.argv) > 1 else "synthetic_appointments.csv"

# ---- กรอบ Andersen: จัดกลุ่มตัวแปร ----
import os
FULL = os.environ.get("FEATURESET", "book") == "full"
if FULL:   # ชุดขยาย: เพิ่มตัวแปรนอกภาคผนวก ก (วิเคราะห์ความไว)
    ANDERSEN = {
     "Predisposing": ["age","sex","marital","education","occupation","prior_noshows","prior_noshow_rate","prior_appts"],
     "Enabling":     ["scheme","distance_km","has_phone","has_caregiver","dow","period","lead_days"],
     "Need":         ["procedure","chronic_disease"],
    }
    CAT = ["sex","marital","education","occupation","scheme","procedure","period"]
else:      # ชุดตามเล่ม (ภาคผนวก ก)
    ANDERSEN = {
     "Predisposing": ["age","sex","marital","prior_noshows","prior_noshow_rate"],
     "Enabling":     ["scheme","out_area","dow","period","lead_days"],
     "Need":         ["procedure","chronic_disease"],
    }
    CAT = ["sex","marital","scheme","procedure","period"]
ALL = sum(ANDERSEN.values(), [])
GROUP_OF = {f: g for g, fs in ANDERSEN.items() for f in fs}

def smote(X, y, rng, k=5):
    """SMOTE แบบเรียบง่าย: สร้างตัวอย่างกลุ่มน้อยให้ได้สัดส่วน 1:1 (ใช้เฉพาะ train)"""
    Xm = X[y == 1]; need = (y == 0).sum() - len(Xm)
    if need <= 0 or len(Xm) <= k: return X, y
    nn = NearestNeighbors(n_neighbors=k + 1).fit(Xm)
    idx = nn.kneighbors(Xm, return_distance=False)[:, 1:]
    base = rng.integers(0, len(Xm), need); nb = idx[base, rng.integers(0, k, need)]
    lam = rng.random((need, 1))
    syn = Xm[base] + lam * (Xm[nb] - Xm[base])
    return np.vstack([X, syn]), np.concatenate([y, np.ones(need, int)])

def metrics(y, p, thr):
    yh = (p >= thr).astype(int); tn, fp, fn, tp = confusion_matrix(y, yh).ravel()
    return dict(accuracy=accuracy_score(y, yh), precision=precision_score(y, yh, zero_division=0),
                recall=recall_score(y, yh), f1=f1_score(y, yh), auc=roc_auc_score(y, p),
                pr_auc=average_precision_score(y, p), brier=brier_score_loss(y, p),
                tn=int(tn), fp=int(fp), fn=int(fn), tp=int(tp), threshold=float(thr))

df = pd.read_csv(CSV, parse_dates=["appt_date"])
df["out_area"] = (df.distance_km > 8).astype(int)   # แทนรหัสหมู่บ้าน ในเขต/นอกเขต
df = pd.get_dummies(df, columns=CAT, dtype=float)
feat_cols = [c for c in df.columns if any(c == f or c.startswith(f + "_") for f in ALL)]
base_of = {c: next(f for f in ALL if c == f or c.startswith(f + "_")) for c in feat_cols}

# ---- Time-based split: train 2023-24 (validation = ครึ่งหลัง 2024), test 2025 ----
yr = df.appt_date.dt.year
core  = df[(df.appt_date < "2024-07-01")]
val   = df[(df.appt_date >= "2024-07-01") & (yr == 2024)]
train = df[yr <= 2024]; test = df[yr == 2025]
print(f"train={len(train)}  (val={len(val)})  test={len(test)} | no-show rate train={train.no_show.mean():.3f} test={test.no_show.mean():.3f}")

def fit_rf(X, y, balance, rng):
    if balance == "smote": X, y = smote(X, y, rng); cw = None
    else: cw = "balanced_subsample" if balance == "weight" else None
    return RandomForestClassifier(n_estimators=500, min_samples_leaf=5, max_features="sqrt",
                                  class_weight=cw, n_jobs=-1, random_state=SEED).fit(X, y)

rng = np.random.default_rng(SEED)
res = {"n": dict(train=len(train), val=len(val), test=len(test)), "models": {}}

# ---- 1) เลือกจุดตัดจาก validation (โมเดลฝึกบน core เท่านั้น) ----
m_val = fit_rf(core[feat_cols].values, core.no_show.values, "smote", np.random.default_rng(SEED))
pv = m_val.predict_proba(val[feat_cols].values)[:, 1]
pr, rc, th = precision_recall_curve(val.no_show, pv)
f1s = 2 * pr[:-1] * rc[:-1] / (pr[:-1] + rc[:-1] + 1e-9)
thr_high = float(th[f1s.argmax()])                      # สูง: จุดที่ F1 สูงสุด
ok = th[rc[:-1] >= 0.90]; thr_low = float(ok.max()) if len(ok) else float(th.min())  # ต่ำ: ยังจับ no-show ได้ >=90%
thr_low = min(thr_low, thr_high)
res["risk_cutoffs"] = dict(low_below=thr_low, high_from=thr_high)
print(f"cutoffs (validation): low<{thr_low:.3f}  high>={thr_high:.3f}")

# ---- 2) ฝึกโมเดลสุดท้ายบน train เต็ม -> ประเมินบน test ----
Xtr, ytr = train[feat_cols].values, train.no_show.values
Xte, yte = test[feat_cols].values, test.no_show.values
variants = {"RF + SMOTE (ตามโครงร่าง)": ("smote", None), "RF + class_weight": ("weight", None), "RF (ไม่ปรับสมดุล)": ("none", None)}
models = {}
for name, (bal, _) in variants.items():
    m = fit_rf(Xtr, ytr, bal, np.random.default_rng(SEED)); models[name] = m
    p = m.predict_proba(Xte)[:, 1]
    res["models"][name] = metrics(yte, p, thr_high if bal == "smote" else 0.5)
lr = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000, class_weight="balanced")).fit(Xtr, ytr)
res["models"]["Logistic regression (baseline)"] = metrics(yte, lr.predict_proba(Xte)[:, 1], 0.5)
# สำหรับ RF+SMOTE รายงานที่ 0.5 ด้วย เพื่อเทียบกับจุดตัดจาก validation
final = models["RF + SMOTE (ตามโครงร่าง)"]; pte = final.predict_proba(Xte)[:, 1]
res["models"]["RF + SMOTE @0.5"] = metrics(yte, pte, 0.5)

for k, v in res["models"].items():
    print(f"{k:34s} AUC={v['auc']:.3f} PR-AUC={v['pr_auc']:.3f} Rec={v['recall']:.3f} Prec={v['precision']:.3f} F1={v['f1']:.3f} Acc={v['accuracy']:.3f}")

# ---- 3) Feature importance: Gini + Permutation (รวมเป็นตัวแปรหลัก/กลุ่ม Andersen) ----
gini = pd.Series(final.feature_importances_, feat_cols).groupby(base_of).sum()
perm = permutation_importance(final, Xte, yte, scoring="roc_auc", n_repeats=15, random_state=SEED, n_jobs=-1)
perm = pd.Series(perm.importances_mean, feat_cols).groupby(base_of).sum()
imp = pd.DataFrame({"gini": gini, "permutation_auc_drop": perm}); imp["andersen_group"] = imp.index.map(GROUP_OF)
imp = imp.sort_values("gini", ascending=False); imp.to_csv("feature_importance.csv")
res["importance"] = imp.reset_index().rename(columns={"index": "feature"}).to_dict("records")
print("\nTop features (Gini | permutation):"); print(imp.head(8).round(4).to_string())

# ---- 4) ระดับความเสี่ยง 3 สี บน test ----
level = np.where(pte >= thr_high, "high", np.where(pte >= thr_low, "medium", "low"))
t = test.assign(p=pte, level=level)
res["risk_table"] = {l: dict(n=int((t.level == l).sum()), noshow_rate=float(t[t.level == l].no_show.mean()))
                     for l in ["high", "medium", "low"] if (t.level == l).any()}
print("\nrisk levels on test:", json.dumps(res["risk_table"], ensure_ascii=False))

# ---- ส่งออก ----
out = pd.read_csv(CSV, parse_dates=["appt_date"]); out = out[out.appt_date.dt.year == 2025].reset_index(drop=True)
out["risk_prob"] = pte.round(4); out["risk_level"] = level; out.to_csv("test_predictions.csv", index=False)
json.dump(res, open("results.json", "w"), ensure_ascii=False, indent=1)
joblib.dump(dict(model=final, features=feat_cols, cutoffs=res["risk_cutoffs"]), "model.joblib")
