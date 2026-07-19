# FanControl — актуальна конфігурація

## Система

- CPU: AMD Ryzen 7 7800X3D, Tjmax 89°C;
- материнська плата: Gigabyte B850 AORUS Elite WIFI7;
- GPU: ASUS Prime RTX 5080;
- корпус: Jonsbo TK-3;
- CPU cooler: ARCTIC Liquid Freezer III Pro 360, встановлена зверху на видув.

ARCTIC Liquid Freezer III Pro 360 замінила:

- баштовий кулер be quiet! Pure Rock Pro 3 LX;
- три окремі верхні витяжні вентилятори.

Поточний повітряний потік:

- 3 нижні вентилятори — intake;
- 3 бокові вентилятори — intake;
- 3 вентилятори радіатора AIO зверху — exhaust;
- 1 задній вентилятор — exhaust.

## Підключення AIO

Використовується кабель окремого керування компонентами:

| Компонент | Розʼєм материнської плати |
|---|---|
| 3× вентилятори радіатора | `CPU_FAN` |
| Помпа | pump header |
| Вентилятор VRM | `CPU_OPT` |

У BIOS для відповідних розʼємів увімкнено PWM. Fan stop для помпи та VRM-вентилятора має залишатися вимкненим, а BIOS повинен забезпечувати їх безпечну роботу до запуску FanControl.

## Мапінг FanControl

| Control | Identifier | Крива |
|---|---|---|
| Top AIO Radiator | `/lpc/it8696e/control/0` | `AIO Radiator` |
| Rear exhaust | `/lpc/it8696e/control/1` | `Rear exhaust` |
| Bottom intake | `/lpc/it8696e/control/2` | `Bottom intake` |
| Vertical intake | `/lpc/it8696e/control/3` | `Vertical intake` |
| AIO VRM Fan | `/lpc/it8696e/control/4` | `AIO VRM Fixed` |
| AIO Pump | `/lpc/it8696e/control/5` | `AIO Pump Fixed` |

Усі control-канали відкалібровані та привʼязані до відповідних RPM-сенсорів `/lpc/it8696e/fan/0–5`.

## Поточна стратегія

```text
Top AIO Radiator → температура CPU Core (Tctl/Tdie)
AIO Pump         → fixed 60%, приблизно 2265–2300 RPM
AIO VRM Fan      → fixed 30%, приблизно 1045–1050 RPM
Rear exhaust     → MAX(CPU, GPU)
Bottom intake    → температура GPU
Vertical intake  → температура GPU
GPU fans         → штатне керування відеокарти
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

Source: GPU. CPU прибрано з джерела, щоб короткі спайки Ryzen не розкручували три бокові вентилятори.

```text
35,10
55,12
68,15
75,30
82,45
90,60
```

Невідомі motherboard sensors `Temperature #1–#5` не використовуються для керування вентиляторами.

## Перевірені результати

### OCCT CPU — 10 хвилин

```text
Mode: Normal
Load: Steady
CPU average: 70°C
CPU maximum: 72°C
Errors: 0
```

### OCCT 3D Adaptive

Під час зафіксованого майже повного GPU-навантаження:

```text
GPU load: 98%
GPU power: приблизно 360 W
GPU temperature: приблизно 70.6°C
GPU fans: приблизно 2200 RPM
Errors на момент перевірки: 0
```

Корпусні вентилятори при цьому залишалися на низьких обертах, тому підвищувати GPU-криві наразі не потрібно.

## Документація

- [`config.json`](config.json) — актуальна конфігурація FanControl;
- [`config_backup.json`](config_backup.json) — конфігурація до встановлення AIO;
- [`arctic-aio-research.md`](arctic-aio-research.md) — початкове дослідження й план переходу;
- [`arctic-aio-setup-log-2026-07-19.md`](arctic-aio-setup-log-2026-07-19.md) — детальна історія налаштування та тестів.

## Що ще перевірити

- [ ] 20–30 хвилин у важкій грі як комбіноване CPU+GPU-навантаження;
- [ ] GPU hotspot, якщо доступний;
- [ ] запуск помпи, VRM і всіх трьох вентиляторів радіатора після повного cold boot;
- [ ] BIOS fan-stop та безпечну швидкість помпи до запуску Windows;
- [ ] джерело залишкового високочастотного писку, тільки якщо він заважає.
