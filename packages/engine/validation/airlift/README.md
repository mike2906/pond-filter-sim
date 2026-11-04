# Airlift validation data

Published airlift pump measurements and correlations, collected to validate the engine's airlift models (drift-flux and empirical fit). Research only: nothing in this folder is imported by the engine yet.

## Bottom line

- **There is very little open, tabulated data at pond scale** (riser around 110 mm, lift under 30 cm). The classic sources (Nicklin 1963, Reinemann 1990, Kassab 2009, Parker & Suttle 1987, Loyless & Malone 1998, Kataoka & Ishii 1987) are paywalled or not online, so no values from them are included.
- The best open leads are two **LSU theses from Malone's group** (Loyless 1995, 2 in riser; Hearn 2009, 20.3 cm riser at 30–46 cm lift). Both PDFs are open, but our fetch tool could not get past p. 51 of one and failed on the other. Getting those tables is the single most useful next step.
- The Kataoka-Ishii branch that applies to pond water at 10–15 °C could not be read (see `correlations.md`). Don't make drift-flux the default until it is.
- Mike has no airlift to measure, so validation has to rest on published data. That makes getting the LSU thesis tables (below) the critical path. `data/field_test_template.csv` stays as an optional format in case anyone contributes measurements later.

## Files

| File | What it is |
|---|---|
| `sources.csv` | Every source looked at: citation, DOI/URL, access, licence, what was extracted, verification level, relevance to ponds |
| `correlations.md` | Equations found, with how far each was verified |
| `data/gephardt2009_laccei_table2.csv` | 12 tabulated points, 1/2.5/4 in risers (secondary, see caveats) |
| `data/riglin2011_table1E.csv` | 40 points, 4 in riser in a closed loop (low relevance, unverified digits) |
| `data/point_observations.csv` | Single operating points and ranges from text (incl. 102 mm / 25 cm lift / 227 L/min) |
| `data/design_rules.csv` | Practitioner rules from Malone and Pfeiffer (velocity, submergence, gas:liquid) |
| `data/figures_to_digitise.csv` | Figures holding the real curves, ranked by priority |
| `data/field_test_template.csv` | Optional empty template for anyone who later measures a pond airlift |

## Verification levels (`verification` column)

- `verified_text`: copied from text we read directly.
- `abstract_verified`: from the abstract only; the paper body was not read.
- `transcribed_from_text_extraction`: a table read from PDF text extraction; column alignment should be checked against the PDF once.
- `model_summary_of_pdf_unverified_digits`: the table came via an automated summary of the PDF, not verbatim text. Internally consistent where checked, but treat digits as unconfirmed.
- `second_hand_unverified_exponents`, `partial`: see the notes in `sources.csv`.

All original units are kept beside SI conversions. US gallons are used where sources print gpm. Air flows are labelled as printed (`scfm` or `cfm`); the sources don't always say whether flows are standard or actual.

## Caveats on the tabulated data

**Gephardt et al. 2009 (LACCEI).** The tank water height (10–20 in) and a 6 in exit above the surface are given, but not where the riser bottom or air injection sits, so the submergence ratio can't be derived. Several points look physically odd: the 4 in riser gives 2.8 L/min at 10 cfm and 10 in water while the 1 in riser gives 15.9 L/min at the same settings, and 4 in risers deliver only 3–4 m³/h at 15–25 m³/h of air (gas:liquid around 6). Use it for trend checks, not for setting the default.

**Riglin 2011.** A closed loop with a throttling valve and air at 10–30 psig. It is not free discharge, so model comparisons need the loop losses, which aren't fully recovered.

**Point observations.** Pfeiffer & Malone (2008) is the closest point to Mike's designs: a 10.2 cm riser lifting about 25 cm delivered 227 L/min (13.6 m³/h). That alone suggests Mike's 92–97 m³/h main airlift target needs roughly seven risers of that size, or larger risers. That is a rough hint, not a design figure.

## How to unblock the high-value data

The container's network policy blocks direct downloads from these hosts, and the fetch tool returns only part of large PDFs. Either of these would fix it:

1. Mike downloads the open PDFs below and drops them in the project files, so the figures and appendices can be read and digitised directly.
   - Loyless 1995: https://repository.lsu.edu/cgi/viewcontent.cgi?article=9301&context=gradschool_disstheses
   - Hearn 2009: https://repository.lsu.edu/cgi/viewcontent.cgi?article=1252&context=gradschool_theses
   - Abou Taleb & Al-Jarrah 2017 (CC BY): https://etasr.com/index.php/ETASR/article/download/1207/525
   - Ishii et al. 2007 NRC report (for Kataoka-Ishii pp. 40–44): https://www.nrc.gov/docs/ML0812/ML081280202.pdf
2. Add `repository.lsu.edu`, `etasr.com` and `www.nrc.gov` to the environment's allowed hosts.

Paywalled papers (Elsevier: Parker & Suttle, Loyless & Malone, Kassab, Reinemann, Kataoka & Ishii) need a library or personal copy. Data digitised from them should stay out of a public repo unless the licence allows it.
