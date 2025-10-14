# Policy Schema Guide

Denne guide beskriver hvordan du definerer felter (fields), kontroller (control), krav (requires/stage) og effekter (effects) i policy-JSON filer pr. family (fx `health.json`, `police.json`).

## Struktur

```json
{
  "family": "health",
  "fields": {
    "field_key": {
      "label": "Visningsnavn",
      "help": "Hjælp – kan bruge ${...} interpolation",
      "stageMin": 1,
      "stageMax": 99,
      "showWhenLocked": true,
      "requires": {
        "buildings": ["bld.hospital"],
        "addons":    ["add.dental_unit"],
        "research":  ["rsd.queue_management"]
      },
      "control": {
        "type": "toggle | slider | percent | number | radio | select | multiselect | text",
        "default": false,
        "min": 0,
        "max": 100,
        "step": 1,
        "options": [
          { "value": "balanced", "label": "Balanceret" }
        ]
      },
      "effects": [
        { "stat": "healthDentistCapacity", "op": "add", "value": 100 },
        { "stat": "taxHealthUsage", "op": "add", "value": { "expr": "(summary.citizens.totals.totalPersons * 0.20)" } },
        { "stat": "healthCapacity", "op": "mul", "value": { "expr": "1 + (choice('health_subsidy_pct')/100) * 0.5" } }
      ]
    }
  }
}
```

## Interpolation og udtryk

- `help` understøtter `${...}` interpolation fra:
  - `summary` (serverens summary; i UI bruges en projiceret summary så hover matcher)
  - `choices` (aktuelle valg; typisk `choice('key')` i effekter)
- Udtryk (`value.expr`) kan bruge:
  - `choice('field_key')`
  - `summary.path.to.number` (f.eks. `summary.capacities.healthCapacity`)
  - Operatorer: `+ - * / ( )`
  - Ikke andet (ingen vilkårlige funktioner/variabler)

  showWhenLocked: hvis du vil vise låste felter i UI

## Requires og Stage

- `stageMin`, `stageMax`: Gating på serveren (feltets effekter ignoreres hvis stage er udenfor).
- `requires`:
  - `buildings`: fx `["bld.hospital"]`
  - `addons`: fx `["add.dental_unit"]`
  - `research`: fx `["rsd.queue_management"]`

Backenden håndhæver både stage og requires.

## Effekter (effects)

- `op`: `add | sub | mul | div`
- `stat`:
  - Kapaciteter: fx `healthCapacity`, `healthDentistCapacity`
  - Forbrug (usage):
    - Slutter på `Usage` → mappes til `useXxx` automatisk (f.eks. `taxHealthUsage` → `useTaxHealth`)
    - Starter med `use` → bruges direkte (f.eks. `useHealth`)
- Add/Sub lægges direkte i summary.
- Mul/Div mappes til multiplikator og anvendes efter add/sub.
- Kildesporing gemmes i `summary.statSources`, og capacity-breakdown i `summary.capChoice`.

## Eksempler

### Eksempel 1: Toggle der øger tandlægekapacitet og koster skat pr. barn
```json
"health_free_dentist_kids": {
  "label": "Gratis tandlæge — børn",
  "control": { "type": "toggle", "default": false },
  "requires": { "buildings": ["bld.hospital"] },
  "effects": [
    { "stat": "healthDentistCapacity", "op": "add", "value": 100 },
    { "stat": "taxHealthUsage", "op": "add", "value": { "expr": "(summary.citizens.groupCounts.kids + summary.citizens.groupCounts.baby) * 100" } }
  ]
}
```

### Eksempel 2: Slider der skalerer sundhedskapacitet
```json
"health_wait_target_days": {
  "label": "Ventetidsmål (dage)",
  "control": { "type": "slider", "default": 60, "min": 10, "max": 180, "step": 5 },
  "effects": [
    { "stat": "healthCapacity", "op": "add", "value": { "expr": "(summary.capacities.healthCapacity / 60) * choice('health_wait_target_days')" } }
  ]
}
```

### Eksempel 3: Procent-tilskud som multiplikator
```json
"health_subsidy_pct": {
  "label": "Tilskud til sundhed (procent)",
  "control": { "type": "percent", "default": 0 },
  "effects": [
    { "stat": "healthCapacity", "op": "mul", "value": { "expr":"1 + 0.5 * (choice('health_subsidy_pct')/100)" } }
  ]
}
```

### Eksempel 4: Direkte usage
```json
"useHealthBoost": {
  "label": "Ekstra forbrug (sundhed)",
  "control": { "type": "number", "default": 0 },
  "effects": [
    { "stat": "useHealth", "op": "add", "value": { "expr": "choice('useHealthBoost')" } }
  ]
}
```

## Kontroller (control.type)

- `toggle` (bool)
- `slider` (min, max, step)
- `percent` (0..100)
- `number` (fri tal)
- `radio` (options[])
- `select` (options[])
- `multiselect` (array af values)
- `text` (streng)
