# ARCTIC Liquid Freezer III Pro 360 — setup log

Date: 2026-07-19

## Hardware and connection

- CPU: AMD Ryzen 7 7800X3D;
- motherboard: Gigabyte B850 AORUS Elite WIFI7;
- GPU: ASUS Prime RTX 5080;
- AIO: ARCTIC Liquid Freezer III Pro 360, top-mounted as exhaust.

Separate-control cable mapping:

| AIO component | Motherboard header |
|---|---|
| 3× radiator fans | `CPU_FAN` |
| Pump | pump header |
| AIO VRM fan | `CPU_OPT` |

All relevant BIOS headers were set to PWM mode. BIOS fan-stop and boot-speed safety settings still need a final cold-boot confirmation.

The small fan on the pump block is the **VRM fan**, not a VRAM fan.

## Identified FanControl channels

| FanControl control | Identifier | Paired RPM sensor | Calibration |
|---|---|---|---:|
| Top AIO Radiator | `/lpc/it8696e/control/0` | `/lpc/it8696e/fan/0` | 606–2935 RPM |
| Rear exhaust | `/lpc/it8696e/control/1` | `/lpc/it8696e/fan/1` | 0–3013 RPM |
| Bottom intake | `/lpc/it8696e/control/2` | `/lpc/it8696e/fan/2` | 0–2789 RPM |
| Vertical intake | `/lpc/it8696e/control/3` | `/lpc/it8696e/fan/3` | 0–3000 RPM |
| AIO VRM Fan | `/lpc/it8696e/control/4` | `/lpc/it8696e/fan/4` | 406–2576 RPM |
| AIO Pump | `/lpc/it8696e/control/5` | `/lpc/it8696e/fan/5` | 747–2812 RPM |

The original `CPU` channel became the radiator channel after the AIO was connected to `CPU_FAN`. The old `Top exhaust` channel was identified as the remaining rear exhaust fan.

## Final initial FanControl configuration

### AIO pump

```text
Curve: AIO Pump Fixed
Mode: Flat
Power: 60%
Observed speed: approximately 2265–2300 RPM
```

Acoustic test:

| Command | Observed speed | Result |
|---:|---:|---|
| 70% | 2528 RPM | audible pump hum |
| 60% | 2300 RPM | significantly quieter |

CPU idle temperature changed only from approximately 51°C to 52°C, which is not a meaningful difference. The pump therefore remains fixed at 60%, pending confirmation under prolonged combined load.

### AIO VRM fan

```text
Curve: AIO VRM Fixed
Mode: Flat
Power: 30%
Observed speed: approximately 1045–1050 RPM
```

A possible high-frequency sound did not change when the VRM fan was tested at approximately 950 RPM and 1700 RPM. The sound is therefore likely coming from another component. The VRM fan was returned to 30%.

### Top AIO radiator

Temperature source: AMD CPU `Core (Tctl/Tdie)`.

| CPU temperature | PWM |
|---:|---:|
| 45°C | 20% |
| 60°C | 20% |
| 70°C | 25% |
| 78°C | 35% |
| 82°C | 50% |
| 85°C | 70% |
| 88°C | 100% |

```text
Response time up: 6 s
Response time down: 20 s
Hysteresis up: 3°C
Hysteresis down: 5°C
Ignore hysteresis at limits: enabled
Command step up: 5%
Command step down: 3%
```

The original research curve reached 100% at 94°C. It was corrected because the Ryzen 7 7800X3D has an official Tjmax of **89°C**. Full radiator speed is now requested at 88°C.

### Rear exhaust

Temperature source: `CPU + GPU MAX`.

| Maximum temperature | PWM |
|---:|---:|
| 40°C | 10% |
| 60°C | 12% |
| 70°C | 15% |
| 78°C | 25% |
| 85°C | 40% |
| 92°C | 60% |

```text
Response time up: 9 s
Response time down: 20 s
Hysteresis up: 3°C
Hysteresis down: 5°C
Start: 13%
Stop: 7%
Command step up: 5%
Command step down: 3%
```

`CPU + GPU MAX` contains only:

```text
MAX(Core (Tctl/Tdie), GPU)
```

### Bottom intake

Temperature source: GPU. Existing curve retained:

```text
40,10
55,12
65,15
75,35
82,55
88,70
95,100
```

```text
Response time: 8 s up / 18 s down
Hysteresis: 3°C up / 5°C down
Start: 13%
Stop: 7%
Command step: 5% up / 3% down
```

### Vertical intake

The old source was `Case MAX = MAX(GPU, Temperature #5, CPU)`. CPU and the unidentified motherboard sensor were removed so the three side fans no longer react to short Ryzen temperature spikes.

Temperature source: GPU only. Existing curve retained:

```text
35,10
55,12
68,15
75,30
82,45
90,60
```

```text
Response time: 9 s up / 18 s down
Hysteresis: 3°C up / 5°C down
Start: 16%
Stop: 7%
Command step: 5% up / 3% down
```

The unused `Case MAX` custom sensor was deleted. `CPU + GPU MAX` remains because Rear exhaust uses it.

## Validation results

### Idle and acoustic checks

- CPU temperature: approximately 51–52°C before load testing;
- pump at 60%: approximately 2265–2300 RPM and significantly quieter than at 70%;
- VRM fan at 30%: approximately 1045–1050 RPM;
- all identified channels remained active.

### CPU-only test

OCCT settings:

```text
Test: CPU
Duration: 10 minutes
Mode: Normal
Load type: Steady
Instruction set: Auto
Threads: Auto
```

Results:

```text
Average CPU temperature: 70°C
Maximum CPU temperature: 72°C
OCCT errors: 0
```

This leaves approximately 17°C below the CPU's 89°C Tjmax. The radiator remained in the quiet lower section of its curve.

### GPU-only test

OCCT settings:

```text
Test: 3D Adaptive
Mode: Steady
Intensity: 100%
Scheduled duration: 10 minutes
```

Observed during the run:

```text
GPU load: 98%
GPU power: approximately 360 W
GPU temperature: approximately 70.6°C
GPU fans: approximately 2187–2200 RPM
Errors at the captured point: 0
```

FanControl snapshot during/after the GPU test:

| Channel | Command | RPM |
|---|---:|---:|
| Top AIO Radiator | 21.6% | 1026 |
| Rear exhaust | 15% | 730 |
| Bottom intake | 21% | 923 |
| Vertical intake | 15% | 764 |
| AIO VRM Fan | 30% | 1045 |
| AIO Pump | 60% | 2265 |
| GPU fan 1 | 74% | 2200 |
| GPU fan 2 | 74% | 2206 |

The GPU remained near 71°C at close to full load while the case fans stayed at low speed. No increase to the GPU-driven case curves is currently justified.

## Electrical check

The Gigabyte B850 AORUS Elite WIFI7 manual specifies up to **2 A / 24 W** per fan header. Three ARCTIC P12 Pro fans have a theoretical combined current of approximately **0.99 A**, leaving adequate headroom on `CPU_FAN`.

## Remaining validation

- [ ] Confirm the final GPU test completed with zero errors.
- [ ] Run a demanding real game for 20–30 minutes as a representative combined CPU+GPU load.
- [ ] Record CPU maximum, GPU maximum, GPU hotspot if available, and maximum RPM for radiator/rear/bottom/vertical fans.
- [ ] Confirm the pump remains near 2300 RPM throughout combined load.
- [ ] Confirm all three radiator fans rotate after a full shutdown and cold boot.
- [ ] Confirm BIOS fan stop is disabled for pump and VRM fan and that both run safely before FanControl starts.
- [ ] Investigate the remaining high-frequency sound only if it is distracting.
- [ ] Remove the unused `Stop` flat curve from FanControl.
- [ ] Update `arctic-aio-research.md` after combined-load and cold-boot validation.

## Sources

- [AMD Ryzen 7 7800X3D — official specifications](https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800x3d.html)
- [Gigabyte B850 AORUS Elite WIFI7 manual](https://download.gigabyte.com/FileList/Manual/mb_manual_b850-aorus-elite-wf7_1101_e.pdf)
- [ARCTIC Liquid Freezer III Pro 360](https://www.arctic.de/en/Liquid-Freezer-III-Pro-360/ACFRE00180A)
