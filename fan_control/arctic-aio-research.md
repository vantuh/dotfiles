# ARCTIC Liquid Freezer III Pro 360 — fan control research

Updated: 2026-07-19

> **Implementation status:** the ARCTIC Liquid Freezer III Pro 360 is installed and has replaced both the be quiet! Pure Rock Pro 3 LX CPU tower and the three separate top-exhaust fans. The current mapping, final initial curves, acoustic decisions, and OCCT results are documented in [`arctic-aio-setup-log-2026-07-19.md`](arctic-aio-setup-log-2026-07-19.md). That setup log and [`config.json`](config.json) supersede the preliminary recommendations below where they differ.

## Context

Current PC and previous cooling layout:

- AMD Ryzen 7 7800X3D;
- Gigabyte B850 AORUS Elite WIFI7;
- ASUS Prime RTX 5080;
- Jonsbo TK-3;
- old CPU cooler: be quiet! Pure Rock Pro 3 LX;
- case fans: 3 bottom intake, 3 top exhaust, 1 rear exhaust, 3 side intake.

The air cooler and three top fans were replaced by an **ARCTIC Liquid Freezer III Pro 360** mounted at the top.

Separate-control cable connection:

| AIO component | Header |
|---|---|
| 3× radiator P12 Pro fans | `CPU_FAN` |
| Pump | `PUMP` |
| AIO VRM fan | `CPU_OPT` |

This layout is appropriate. The small fan on the pump block is a **VRM fan**, not a VRAM fan: it cools the CPU voltage-regulator area around the socket.

## Official specifications

| Component | Speed range | Electrical specification |
|---|---:|---:|
| Pump | 800–2800 RPM | 0.35 A, 12 V DC |
| VRM fan | 400–2500 RPM | 0.05 A, 12 V DC |
| P12 Pro radiator fan | 600–3000 RPM | 0.33 A per fan, 12 V DC |

The 38 mm radiator has three pre-installed P12 Pro fans. Pump, VRM fan, and radiator fans can be controlled separately. ARCTIC also provides a synchronized all-in-one cable, but separate control allows better acoustic tuning.

Sources:

- [ARCTIC Liquid Freezer III Pro 360](https://www.arctic.de/en/Liquid-Freezer-III-Pro-360/ACFRE00180A)
- [Installation manual](https://support.arctic.de/liquid-freezer-III-pro-360)
- [Documentation](https://support.arctic.de/liquid-freezer-III-pro-360/docs)

## Previous FanControl configuration (historical)

Before assisted setup and recalibration, [`config.json`](config.json) described the previous cooling layout:

- `CPU` (`/lpc/it8696e/control/0`) is calibrated for the Pure Rock Pro fans, maximum approximately 2039 RPM;
- `Top exhaust` (`/lpc/it8696e/control/1`) is calibrated for the previous top/rear P12 Pro group, maximum approximately 3027 RPM;
- `Fan #5` and `Fan #6` are hidden and disabled;
- control names may no longer match physical headers;
- paired RPM sensors may now point to the wrong devices;
- the old `Top exhaust` group no longer represents the physical layout.

Those old calibrations were not reused. The current channels are identified, renamed, paired, and recalibrated; see the setup log for the resulting mapping.

## Target FanControl layout

After identifying physical channels, rename them approximately as follows:

```text
AIO Radiator
AIO Pump
AIO VRM
Rear exhaust
Bottom intake
Vertical intake
```

Target strategy:

```text
CPU_FAN → AIO Radiator → CPU temperature curve
PUMP    → AIO Pump     → fixed speed initially
CPU_OPT → AIO VRM      → fixed speed initially

Bottom intake   → GPU temperature curve
Vertical intake → GPU or GPU + verified system sensor
Rear exhaust    → CPU + GPU MAX with slow response
```

The `/lpc/it8696e/control/*` identifiers must be discovered in FanControl, not inferred from their old names.

## Recommended starting settings

These are initial values. Final settings must be based on calibration, temperatures, and subjective noise.

### AIO Pump

```text
Mode: Fixed
Power: 70%
Fan stop: disabled
```

A stable pump speed should sound better than reacting to short Ryzen spikes. If audible, test 65%, then 60%. Do not go below 50% without sustained load testing.

BIOS baseline:

```text
Control mode: PWM
Boot/default speed: 70–100%
Fan stop: disabled
```

This keeps the pump operating before FanControl starts and if FanControl is unavailable.

### AIO Radiator

Source: AMD CPU `Core (Tctl/Tdie)`.

| CPU temperature | PWM |
|---:|---:|
| 45°C | 20% |
| 60°C | 20% |
| 70°C | 25% |
| 78°C | 35% |
| 85°C | 50% |
| 90°C | 70% |
| 94°C | 100% |

Smoothing:

```text
ResponseTimeUp: 5–6 s
ResponseTimeDown: 20 s
HysteresisValueUp: 3°C
HysteresisValueDown: 5°C
CommandStepUp: 5
CommandStepDown: 3
```

The old CPU curve should not be copied directly: the old fans reached about 2000 RPM, while the radiator P12 Pro fans reach 3000 RPM and become much louder at high PWM.

### AIO VRM fan

```text
Mode: Fixed
Power: 25–30%
Fan stop: disabled
```

Use calibration to find the lowest setting that starts reliably after a cold boot, does not stall, and avoids high-frequency noise.

If a verified `VRM MOS` sensor exists:

| VRM temperature | PWM |
|---:|---:|
| 40°C | 20% |
| 60°C | 25% |
| 75°C | 40% |
| 90°C | 70% |
| 100°C | 100% |

Do not use unidentified `Temperature #1–#5` sensors until their meaning is established.

### Bottom intake

Keep the current GPU curve initially:

```text
40,10
55,12
65,15
75,35
82,55
88,70
95,100
```

The bottom intake directly supplies the RTX 5080 and should remain primarily GPU-driven.

### Vertical intake

Current `Case MAX` is:

```text
MAX(GPU, Temperature #5, CPU)
```

Remove CPU temperature. CPU spikes are handled by the radiator and should not ramp three side fans.

Preferred sources:

1. `MAX(GPU, verified motherboard/system temperature)`;
2. GPU only if the motherboard sensor cannot be identified.

Keep the current curve initially:

```text
35,10
55,12
68,15
75,30
82,45
90,60
```

### Rear exhaust

The rear fan was previously part of `Top exhaust`; its current physical connection must be identified.

Suggested curve from `CPU + GPU MAX`:

| Maximum temperature | PWM |
|---:|---:|
| 40°C | 10% |
| 60°C | 12% |
| 70°C | 15% |
| 78°C | 25% |
| 85°C | 40% |
| 92°C | 60% |

Use 8–10 seconds response up, 20 seconds down, and 3°C/5°C hysteresis.

## Implementation checklist

### Identify every header

- [ ] Show hidden FanControl controls and sensors.
- [ ] Change one control at a time between approximately 30% and 70%.
- [ ] Observe which physical fan and RPM sensor react.
- [ ] Identify radiator, pump, VRM, rear, bottom, and side channels.
- [ ] Rename controls and RPM sensors.
- [ ] Pair each control with the correct RPM sensor.
- [ ] Document the final `/control/*` and `/fan/*` mapping here.

Never stop the pump during identification; keep it at a safe fixed value.

### Recalibrate changed channels

- [ ] Recalibrate `AIO Radiator`.
- [ ] Recalibrate `AIO Pump` if FanControl supports meaningful pump calibration.
- [ ] Recalibrate `AIO VRM`.
- [ ] Verify minimum start and stop percentages.
- [ ] Verify that all three radiator fans rotate at minimum PWM.
- [ ] Remove calibration inherited from the Pure Rock configuration.

### Confirm BIOS safety defaults

- [ ] Set radiator, pump, and VRM headers to PWM mode.
- [ ] Disable fan stop for pump and VRM.
- [ ] Ensure the pump runs at 70–100% before Windows starts.
- [ ] Keep `CPU_FAN` monitoring enabled for radiator-fan failure detection.
- [ ] Verify behaviour after a full shutdown and cold boot.

### Verify header current limits

Three P12 Pro fans can theoretically approach 1 A total.

- [ ] Check the exact motherboard revision manual for the `CPU_FAN` current/power limit.
- [ ] Confirm adequate margin for three P12 Pro fans.
- [ ] If the header is rated for only 1 A without useful margin, consider a SATA-powered PWM hub while retaining tach on `CPU_FAN`.

Do not assume a header rating without checking the exact Gigabyte B850 AORUS Elite WIFI7 revision manual.

## Validation plan

Record ambient temperature when possible.

### Idle and normal work — 20–30 minutes

- [ ] Record CPU/GPU temperatures and all relevant RPM values.
- [ ] Listen for pump hum, VRM-fan whine, resonance, and repeated ramping.
- [ ] Confirm that no active channel periodically drops to 0 RPM.

### CPU load — 15–30 minutes

- [ ] Record peak and sustained CPU temperature.
- [ ] Confirm smooth radiator ramping.
- [ ] Compare fixed pump settings of 60%, 70%, 80%, and 100%.
- [ ] Keep the lowest quiet setting that does not materially worsen sustained temperature.

### GPU load — 20–30 minutes

- [ ] Record GPU core and hotspot temperature if available.
- [ ] Verify bottom-intake response.
- [ ] Confirm side intake does not react to harmless CPU spikes.
- [ ] Check whether radiator exhaust causes GPU heat recirculation.

### Combined CPU and GPU load

- [ ] Use a representative game or combined workload.
- [ ] Record CPU, GPU, and motherboard/system temperatures.
- [ ] Confirm rear and radiator exhaust remove accumulated heat.
- [ ] Raise side/bottom intake by 5–10% above 75°C GPU only if required.
- [ ] Verify that neither CPU nor GPU remains near its thermal limit.

Initial targets:

- sustained CPU preferably below about 85–90°C in representative workloads;
- GPU core preferably below about 80°C;
- no pump or fan stalls;
- no distracting ramping during light workloads.

Short Ryzen spikes are expected and matter less than sustained temperature.

## Further improvements

### Map motherboard sensors

Identify `Temperature #1–#5`:

1. record values at idle;
2. run CPU-only load and note which sensors rise;
3. run GPU-only load and note which sensors rise;
4. compare timing and magnitude;
5. rename only sensors whose behaviour is consistent.

A verified system or PCIe-area sensor is more useful for case fans than raw CPU package temperature.

### Average radiator input

If FanControl provides an average/time sensor or suitable plugin:

- create a 5–10 second CPU-temperature average;
- use it for normal radiator control;
- retain emergency ramping near 90–94°C.

This should reduce reactions to short 7800X3D spikes.

### Tune pump speed empirically

Test fixed 60%, 70%, 80%, and 100% under the same sustained CPU workload. Compare sustained CPU temperature, radiator RPM, pump noise, and resonance. Select the quietest stable point before diminishing returns.

### Find acoustic resonance zones

For every channel:

1. step through PWM in 5% increments;
2. wait for sound to stabilize;
3. note humming, beating, or case resonance;
4. make curves avoid holding those ranges or cross them quickly.

A numerically smooth curve is not always acoustically smooth.

### Rebalance case pressure

Final airflow is approximately:

- intake: 3 bottom + 3 side;
- exhaust: 3 radiator + 1 rear.

At low load this should provide mild positive pressure. Under CPU load, radiator exhaust may dominate.

- inspect dust accumulation after several weeks;
- check whether air enters through unfiltered gaps;
- if CPU load creates negative pressure, modestly raise side intake when radiator demand remains high;
- do not match PWM percentages blindly because fan restrictions differ.

### Optional mixed side-intake control

If combined load raises case temperature, use:

```text
MAX(GPU temperature curve, slow limited radiator-demand curve)
```

Keep the radiator-derived component slow and limited so short CPU spikes do not ramp all case fans.

### Failure visibility and backups

- expose pump and radiator RPM in the FanControl dashboard/tray;
- configure alerts if supported by the installed FanControl version;
- periodically verify RPM after BIOS or FanControl updates;
- preserve a known-good configuration backup.

## When to update the main configuration

Update [`config.json`](config.json) and this document only after:

- every physical channel is identified;
- changed channels are calibrated;
- the rear fan connection is known;
- BIOS PWM/fan-stop settings are confirmed;
- idle, CPU, GPU, and combined-load tests are complete;
- final curves no longer produce distracting ramping.

Keep [`config_backup.json`](config_backup.json) as the pre-AIO reference until the new setup is validated.
