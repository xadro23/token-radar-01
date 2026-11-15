# Launch Radar — how it works

This dashboard ranks every protocol in the sealed snapshot that **records no token** (no symbol, no
CoinGecko id, no market cap) and is **not** a wrapped, staked or bridged product of a token that
already trades, an exchange-branded product, or a versioned pool of another protocol. The 40 watchlist
slugs are the floor; the other 158 rows are the early finds below the $50,000,000 floor that a TVL
table would never surface.

## The value model

```
comp multiple  = median(mcap / TVL) of the live-token protocols in the same category
base value     = TVL × comp multiple
growth ×       = 1 + clamp(7-day change, −60..+120%)/100 × 0.5
longevity ×    = 0.85 + min(age, 730d)/730d × 0.45
implied value  = max(1, round(base × growth × longevity))
```

Every number is learned from the snapshot itself — there is no hardcoded list of names anywhere in
`lib/model.ts`. The comp multiple is the market's own pricing: if the market pays a median 0.21× TVL
for Risk Curators, a $2.75B-TVL curator with no token gets a base value of $589M, the way the market
already values that kind of business. Protocols whose token trades never appear on the board; they are
the comp set each row is priced against. A category with fewer than three live comps falls back to the
whole-market median, so every row has a defensible comp.

## Farm plans

Each row's seven steps are generated in `farmSteps()` from the protocol's own record — its category
determines the concrete action (liquidity, lending, bridging, staking, vaults, RWA onboarding…), its
TVL sets the suggested capital, its chain count sets the second action, and its no-token age sets how
long to hold and why (young protocols get a 90-day window because early consistent users are the
scarcest cohort). Cost and time are attached to every step.

## What the page shows

- **Board** — the three medal heroes, then a sortable table (rank, name, chains, TVL, 7-day change,
  no-token age, implied value with a meter bar). Click any row for the detail view.
- **Radar scan** — filter by chain chips, category and minimum TVL; cards show each match's comp
  multiple and comp source.
- **Model** — the full formula, the category comp multiples, and what the model does and does not
  claim.

The implied value is this radar's own claim for comparison, derived only from the snapshot's figures.
It is not a prediction that any token is issued, and DefiLlama's record is not proof: a protocol here
*records* no token — it may still hold one its record does not carry.
