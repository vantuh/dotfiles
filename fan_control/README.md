# FanControl — current configuration

## System

- CPU: AMD Ryzen 7 7800X3D, Tjmax 89°C;
- motherboard: Gigabyte B850 AORUS Elite WIFI7;
- GPU: ASUS Prime RTX 5080;
- case: Jonsbo TK-3;
- CPU cooler: ARCTIC Liquid Freezer III Pro 360, mounted at the top as exhaust.

ARCTIC Liquid Freezer III Pro 360 replaced:

- the be quiet! Pure Rock Pro 3 LX tower cooler;
- three separate top exhaust fans.

Current airflow:

- 3 bottom fans — intake;
- 3 side fans — intake;
- 3 AIO radiator fans at the top — exhaust;
- 1 rear fan — exhaust.

## AIO wiring

A dedicated component-control cable is used:

| Component | Motherboard header |
|---|---|
| 3× radiator fans | `CPU_FAN` |
| Pump | pump header |
| VRM fan | `CPU_OPT` |

PWM is enabled in BIOS for the corresponding headers. Fan stop for the pump and VRM fan should stay disabled, and BIOS should keep them running safely until FanControl starts.

## FanControl mapping

| Control | Identifier | Curve |
|---|---|---|
| Top AIO Radiator | `/lpc/it8696e/control/0` | `AIO Radiator` |
| Rear exhaust | `/lpc/it8696e/control/1` | `Rear exhaust` |
| Bottom intake | `/lpc/it8696e/control/2` | `Bottom intake` |
| Vertical intake | `/lpc/it8696e/control/3` | `Vertical intake` |
| AIO VRM Fan | `/lpc/it8696e/control/4` | `AIO VRM Fixed` |
| AIO Pump | `/lpc/it8696e/control/5` | `AIO Pump Fixed` |

All control channels are calibrated and bound to the matching RPM sensors `/lpc/it8696e/fan/0–5`.

## Current strategy

```text
Top AIO Radiator → CPU Core temperature (Tctl/Tdie)
AIO Pump         → fixed 60%, about 2265–2300 RPM
AIO VRM Fan      → fixed 30%, about 1045–1050 RPM
Rear exhaust     → MAX(CPU, GPU)
Bottom intake    → GPU temperature
Vertical intake  → GPU temperature
GPU fans         → native GPU fan control
```

### AIO Radiator

| CPU | PWM |
|---:|---:|
| 45°C | 20% |
| 60°C | 20% |
| 70°C | 25% |
| 78°C | 35% |
| 82°C | 50% |
| 85°C | 70% |
| 88°C | 100% |

```text
Response: 6 s up / 20 s down
Hysteresis: 3°C up / 5°C down
Command step: 5% up / 3% down
```

### Rear exhaust

Source: `CPU + GPU MAX`.

```text
40,10
60,12
70,15
78,25
85,40
92,60
```

### Bottom intake

Source: GPU.

```text
40,10
55,12
65,15
75,35
82,55
88,70
95,100
```

### Vertical intake

Source: GPU. CPU was removed from the source so short Ryzen spikes do not spin up the three side fans.

```text
35,10
55,12
68,15
75,30
82,45
90,60
```

Unknown motherboard sensors `Temperature #1–#5` are not used for fan control.

## Verified results

### OCCT CPU — 10 minutes

```text
Mode: Normal
Load: Steady
CPU average: 70°C
CPU maximum: 72°C
Errors: 0
```

### OCCT 3D Adaptive

During recorded near-full GPU load:

```text
GPU load: 98%
GPU power: about 360 W
GPU temperature: about 70.6°C
GPU fans: about 2200 RPM
Errors at check time: 0
```

Case fans stayed at low RPM, so raising the GPU curves is not needed for now.

## Documentation

- [`config.json`](config.json) — current FanControl configuration;
- [`config_backup.json`](config_backup.json) — configuration before the AIO install;
- [`arctic-aio-research.md`](arctic-aio-research.md) — initial research and migration plan;
- [`arctic-aio-setup-log-2026-07-19.md`](arctic-aio-setup-log-2026-07-19.md) — detailed setup and test history.

## Still to check

- [ ] 20–30 minutes in a demanding game as combined CPU+GPU load;
- [ ] GPU hotspot, if available;
- [ ] pump, VRM, and all three radiator fans after a full cold boot;
- [ ] BIOS fan-stop and a safe pump speed before Windows starts;
- [ ] source of residual high-frequency whine, only if it becomes annoying.
