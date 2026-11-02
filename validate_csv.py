"""ตรวจคุณภาพไฟล์ CSV ก่อนฝึกโมเดลหรือให้คะแนน
ใช้: python3 validate_csv.py ไฟล์.csv [--upcoming]   (ค่าเริ่มต้น = ไฟล์ฝึกที่มีคอลัมน์ no_show)"""
import sys, pandas as pd
from schema import validate
if len(sys.argv) < 2: sys.exit(__doc__)
df = pd.read_csv(sys.argv[1], dtype={"patient_id": str})
E, W = validate(df, training="--upcoming" not in sys.argv)
print(f"อ่านได้ {len(df)} แถว {len(df.columns)} คอลัมน์")
for w in W: print("  [คำเตือน]", w)
for e in E: print("  [ผิดพลาด]", e)
print("ผ่าน" if not E else f"ไม่ผ่าน {len(E)} รายการ"); sys.exit(1 if E else 0)
