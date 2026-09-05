# Ripple Effect Country Context

GitHub Pages-ready comparison dashboard for Kenya, Uganda, Rwanda, Burundi, Ethiopia and Zambia.

## Data connections already built

### No credentials required
The scheduled GitHub Action refreshes these automatically:

- **World Bank Indicators API** — population, rural population %, employment in agriculture %
- **UNHCR Refugee Data Finder API** — refugees hosted
- **NOAA/PSL** — Niño 3.4 monthly SST anomaly and recent direction
- **GDACS** — current disaster alerts associated with the six countries

### HDX HAPI connections — code complete, one identifier required
The refresh script also contains production connectors for:

- **INFORM Risk Index** — overall risk, hazard/exposure, vulnerability and lack of coping capacity
- **CHIRPS/WFP rainfall** — latest rolling rainfall anomaly; country figure is pixel-weighted from Admin-1 data
- **IPC food security** — current IPC Phase 3+ population and share where data are available
- **IOM DTM IDPs** — latest comparable displacement total where available
- **ACLED via HAPI** — aggregated political-violence events for the latest three months and change vs the previous three months
- **OCHA FTS** — humanitarian appeal requirement, funding and percentage funded

HDX HAPI requires an `app_identifier` on API requests. Generate one using the official HDX HAPI `encode_identifier` flow, then add it to the GitHub repository as an Actions secret named exactly:

`HAPI_APP_IDENTIFIER`

Nothing else in the site needs changing. The next scheduled/manual refresh will populate all HAPI-backed cells for which HAPI has country coverage.

Official setup documentation: https://hdx-hapi.readthedocs.io/en/latest/getting-started/

## Refresh behaviour

The workflow runs daily at **05:17 UTC** and can also be run manually from **Actions → Refresh country context data → Run workflow**.

Each source is fault-tolerant. If one API fails, its previous snapshot is retained while the other feeds continue refreshing. The site reads `data/public-data.js`, so visitors never wait for third-party API calls.

## Data interpretation safeguards

- The site keeps the **global ENSO signal** separate from **country climate outlook concern**. It does not infer country impacts from Niño 3.4 alone.
- ACLED/HAPI event categories are non-mutually-exclusive, so the dashboard uses a single **political violence** aggregate instead of adding categories together.
- IPC figures prefer national current-period records; subnational aggregation is used only where necessary.
- Rainfall anomalies are aggregated with the source raster pixel counts rather than averaging admin units equally.
- Missing country coverage stays visible as a gap rather than being replaced by a proxy.

## GitHub Pages

Upload the folder to a repository and enable GitHub Pages from the main branch/root. The site is static and needs no server runtime.

## Climate & El Niño drill-downs

The site now includes country climate drill-downs for Kenya, Uganda, Rwanda, Burundi, Ethiopia and Zambia.

- Global ENSO signal: NOAA Niño 3.4 (automated when the GitHub Action runs).
- Observed rainfall: CHIRPS via HDX HAPI (automated when `HAPI_APP_IDENTIFIER` is configured).
- East Africa seasonal outlook: ICPAC, with a curated authoritative snapshot dated 18 Aug 2026 and links to the current ICPAC seasonal forecast pages.
- Zambia seasonal outlook: SADC Climate Services Centre / SARCOF-33, snapshot dated 27 Aug 2026.
- Forecast guidance and observed rainfall are displayed separately.
- Ethiopia and Zambia retain geographic caveats rather than forcing a single national wet/dry assessment.

The regional outlook narrative is deliberately curated rather than scraped from unstructured webpages automatically. This avoids silently changing the interpretation when a source site changes its page structure. The live quantitative layers (NOAA and CHIRPS) still refresh automatically.

## Automatic change detection

Every refresh keeps a compact copy of the previous successful snapshot and generates `changes` in `data/public-data.json` / `data/public-data.js`.

The homepage shows up to six of the highest-signal changes immediately below the country comparison table. Stable indicators are deliberately omitted.

Current material-change thresholds are deliberately conservative:

- NOAA Niño 3.4: >= 0.2 C month-to-month movement, or a change in ENSO signal
- CHIRPS rainfall anomaly: >= 15 percentage-point movement, or crossing +/-20% vs normal
- IPC Phase 3+: >= 10% change and >= 50,000 people
- IOM DTM IDPs: >= 10% change and >= 25,000 people
- Political violence: >= 20% change in the rolling 3-month aggregate
- OCHA FTS funding: >= 10 percentage-point change in percentage funded
- INFORM overall risk: >= 0.3 change on the 0-10 scale
- Refugees hosted: >= 5% change and >= 10,000 people
- GDACS: any newly appearing alert associated with a programme country

These thresholds are dashboard rules for attention management, not official warning thresholds. They can be tuned after a few weeks of real data.

On the first successful refresh there is no previous snapshot, so the dashboard explains that change detection begins after the second refresh.

## Subnational drill-downs
Ethiopia and Zambia now include a subnational climate section. Curated regional interpretation is always visible; when `HAPI_APP_IDENTIFIER` is configured, the nightly refresh also retrieves Admin-1 CHIRPS rainfall, IPC food-security and political-violence aggregates for those two countries. The same rendering pattern can be extended to Kenya and Uganda later.
