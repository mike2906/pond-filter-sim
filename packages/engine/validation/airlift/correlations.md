# Airlift correlations: what we could and could not verify

Each entry says where the text came from. "Verified" means the equation was read in a primary or open source; "partial" means OCR or a second-hand quote with digits we could not fully confirm. Nothing here is filled in from memory without a flag.

## 1. Castro & Zielinski (1980), as quoted by Loyless (1995) Eq. 18 — partial

```
Q = [0.781 · S^0.15 · L^0.33 + 0.0169] · D^1.1
```

- Q: maximum liquid flow (L/min) at the authors' optimal air rate; S: submergence ratio (–); L: total pipe length (cm); D: pipe diameter (cm).
- Exponents 0.15, 0.33, 1.1 were read from flattened OCR superscripts ("S 15", "L 0 33", "D 11"). **Confirm against the Loyless PDF page before using.**
- Fitted on short, small-diameter pipes (Castro 1975: "short length and small diameter"). Extrapolating to D = 11 cm is outside its basis.
- Sanity check: D = 5 cm, L = 100 cm, S = 0.7 gives about 20 L/min, which is plausible for a 2 in airlift.

## 2. Kataoka & Ishii (1987) large-diameter drift flux — partial

Read via the OCR of Ishii et al. (2007), NRC report PU/NE-07-06, §3.4, Eqs. (3-7) to (3-11), p. 40 onward. The digits 0.0019, 0.809, 0.157, 0.030, 0.562 and the D* = 30 split are legible in the OCR; the layout below is the standard form those digits belong to and must be checked against the scan.

```
<v_g> = C0 · <j> + V_gj
C0    = 1.2 − 0.2 · sqrt(rho_g / rho_f)                        (round tube, Eq. 3-11)
V_gj+ = V_gj / (sigma · g · drho / rho_f^2)^0.25
D*    = D / sqrt(sigma / (g · drho))
N_muf = mu_f / (rho_f · sigma · sqrt(sigma / (g · drho)))^0.5

Low-viscous case (N_muf <= 2.25e-3):
  V_gj+ = 0.0019 · D*^0.809 · (rho_g/rho_f)^-0.157 · N_muf^-0.562   for D* <= 30
  V_gj+ = 0.030           · (rho_g/rho_f)^-0.157 · N_muf^-0.562   for D* >= 30
High-viscous case (N_muf > 2.25e-3), D* >= 30:
  V_gj+ = 0.92 · (rho_g/rho_f)^-0.157 [· ?]   -- exponents NOT legible in the OCR
```

**Important for pond use.** For air/water and a 110 mm riser, D* ≈ 40 (large-diameter branch). But N_muf for water is right on the 2.25e-3 boundary:

| Water temp (°C) | Laplace length (mm) | D* for 110 mm | N_muf |
|---|---|---|---|
| 10 | 2.75 | 40.0 | 2.89e-3 (high-viscous branch) |
| 15 | 2.74 | 40.1 | 2.54e-3 (high-viscous branch) |
| 20 | 2.73 | 40.3 | 2.25e-3 (boundary) |
| 25 | 2.72 | 40.5 | 2.02e-3 (low-viscous branch) |

If the high-viscous branch is simply V_gj+ = 0.92·(rho_g/rho_f)^-0.157 (as the legible digits suggest), it gives 2.71 at 20 °C against 2.65 from the low-viscous branch at N_muf = 2.25e-3, so the two would join almost continuously. That is a consistency hint, not a verification.

So for most pond temperatures the branch we could **not** read applies. The engine should not ship Kataoka-Ishii as the default until Eq. (3-9) is read from the scan. For reference, the low-viscous branch at 20 °C gives V_gj ≈ 0.43 m/s, against 0.35·sqrt(g·D) ≈ 0.36 m/s for a Taylor bubble in a 110 mm tube.

## 3. Zuber–Findlay churn/slug drift velocities — not verified here

The common forms (churn: V_gj = 1.41·(sigma·g·drho/rho_f^2)^0.25; slug: V_gj = 0.35·sqrt(g·D)) were not found in the open documents we could read. They are textbook-standard, but this folder does not have a verified citation for them yet. The ANL-77-47 report (Ishii 1977) should contain the churn form; its OCR was too garbled.

## 4. Ligus et al. (2019) drift-flux form with small-diameter drift — verified (CC BY 3.0)

```
R_G   = Q'_G / (C0 · (Q'_L + Q'_G) + W'_Ts)
Q'_L  = W_LO / sqrt(g·D),  Q'_G = W_GO / sqrt(g·D)
W'_Ts = 0.352 · (1 − 318·sigma/(rho_L·g·D^2) − 14.77·(sigma/(rho_L·g·D^2))^2)
eta   = Q'_L / (C0·(Q'_L + Q'_G) + W'_Ts − Q'_G)
```

The paper is inconsistent about C0 (text: 1.2 and 2.0 "respectively" for laminar/turbulent; nomenclature: 1.2 for high Re, 2.0 for low Re). The nomenclature reading matches standard practice. Note W'_Ts → 0.352 for large D, i.e. the 0.35·sqrt(gD) Taylor-bubble term.

## 5. Empirical log fits (Parker & Suttle 1987; Loyless & Malone 1998; Wurts 1994) — coefficients not obtained

All three report water flow ∝ log(air flow). No coefficients were reachable: Parker & Suttle and Loyless & Malone are paywalled (Elsevier), and the open Loyless (1995) thesis cut off before Chapter 4. The engine's "empirical fit" option therefore has **no verified coefficients yet**; fit it to the datasets in `data/` instead of a quoted equation.
