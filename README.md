# F1 Replay

Aplicación web que usa [FastF1](https://github.com/theOehrly/Fast-F1) para repetir cualquier sesión de F1 (carrera, sprint, clasificación o libres): ves la pista con los autos moviéndose y las métricas de cada piloto.

## Qué muestra
- **Pista animada** con los pilotos en su posición real (datos GPS), números de curva, línea de meta y opción de colorear la pista según la velocidad.
- **Controles de reproducción**: play/pausa, velocidad de ×1 a ×64, línea de tiempo con franja de banderas (amarilla, SC, VSC, roja). Atajos: `Espacio`, `←` y `→` (±10 s).
- **Clasificación en vivo**: posición, diferencia con el líder o intervalo, vueltas perdidas, neumático, PIT, DRS, OUT y posiciones ganadas respecto a la parrilla.
- **Panel del piloto** (haz clic en un auto o en una fila): velocidad, marcha, RPM, acelerador, freno, DRS, neumático y su edad, última vuelta con sectores coloreados (morado, verde, amarillo), mejor vuelta y número de paradas.
- **Análisis**: tiempos por vuelta, posiciones vuelta a vuelta, estrategia de neumáticos, comparación de telemetría entre las vueltas rápidas de dos pilotos, resultados y clima con los mensajes de Dirección de Carrera.

## Versión en línea
**https://jaimevergara.github.io/f1-replay/**

GitHub Pages no ejecuta Python, así que la versión en línea es estática: un workflow de GitHub Actions
(`.github/workflows/pages.yml`) ejecuta `export_static.py`, que genera las carreras y sprints de la temporada
como archivos JSON, y publica el sitio. Se actualiza solo cada lunes y también se puede lanzar a mano desde
la pestaña **Actions** → *Publicar en GitHub Pages* → *Run workflow*. En línea no está el botón de F1TV, porque
no hay servidor donde iniciar sesión.

## Uso local
```bash
pip install -r requirements.txt
python app.py
```
Luego abre http://localhost:5000. También puedes hacer doble clic en `iniciar.bat`. La versión local puede abrir
cualquier sesión (también clasificación y libres) y conectarse a F1TV.

Para generar el sitio estático en tu computador: `python export_static.py --years 2026` (queda en `site/`).

### Fuentes de datos
- **Calendario y circuitos** (curvas y orientación de la pista): siempre vienen de FastF1.
- **Datos de la sesión**:
  - **Sin cuenta (por defecto):** se usa [OpenF1](https://openf1.org), que es gratis y tiene datos desde 2023. Incluye posiciones GPS, telemetría, vueltas, neumáticos, paradas, clima y mensajes de Dirección de Carrera. El estado de pista (amarilla, SC, VSC, roja) se reconstruye a partir de esos mensajes.
  - **Con F1TV:** desde 2026, FastF1 exige una suscripción F1TV para acceder al cronometraje oficial. Haz clic en el botón **F1TV** arriba a la derecha y escribe tu correo y contraseña (también sirve `python -m fastf1 auth f1tv --authenticate` en una terminal). Las credenciales van solo al servidor local de la app, que las pasa directo a Fórmula 1; no se guardan, y FastF1 guarda solo el token de acceso. Con la cuenta conectada (punto verde), la app usa FastF1 automáticamente y también tienes temporadas anteriores a 2023.
- **Sesiones recientes:** se pueden abrir apenas empiezan, sin esperar 3 horas. Mientras están en curso o recién terminadas (hasta 4 h desde el inicio), no se guardan en caché y se reconstruyen cada minuto, para no quedar pegadas con datos incompletos. Sin F1TV, OpenF1 puede no tener los datos de una sesión en curso, porque los reserva a cuentas pagadas; en ese caso la app lo avisa.

El encabezado de cada sesión indica qué fuente se usó.

## Notas
- **Carga por tramos (lazy loading):** al abrir una sesión solo se descargan los datos livianos (pista, pilotos, vueltas, clima, mensajes y cronometraje oficial), lo que toma unos 12 s la primera vez. Las posiciones y la telemetría llegan en tramos de 5 minutos (~5 s cada uno) a medida que avanza la repetición, y los siguientes se piden por adelantado. Si saltas a un tramo que no ha llegado, aparece un aviso sobre la pista y el reloj espera. La barra bajo la línea de tiempo muestra lo que ya se descargó.
- La telemetría de la pestaña "Comparar vueltas" se pide solo al abrirla.
- Todo lo descargado queda guardado en `cache/replays/`, así que una sesión ya vista se abre en menos de un segundo.
- Con OpenF1 la clasificación y los gaps de carrera son los del cronometraje oficial. Con FastF1 se estiman con el progreso en pista (vueltas completadas + fracción de la vuelta). En clasificación y libres, el orden lo define la mejor vuelta hasta ese momento.
- En 2026 el indicador de DRS siempre aparece apagado, porque el reglamento eliminó el DRS.
