import { GAMES } from "./lib/games.ts";
import { formatNum, formatSens, formatYaw } from "./lib/format.ts";
import type { Health } from "./lib/health.ts";
import { sensFromCm } from "./lib/sensitivity.ts";
import type { Setup } from "./setup.ts";

export function Method({ setup, health }: { setup: Setup; health: Health | null }) {
  const source = GAMES.find((game) => game.id === setup.gameId) ?? GAMES[0];
  const cs2 = GAMES.find((game) => game.id === "cs2") ?? GAMES[1];
  const mirrored = health ? sensFromCm(health.cm360, setup.dpi, cs2.yaw) : Number.NaN;

  return (
    <article className="method">
      <header className="view-head">
        <h1>Método</h1>
        <p>Qué mide cada cifra, y cuándo conviene cambiarla.</p>
      </header>

      <section>
        <h2>cm/360</h2>
        <p>
          Es la distancia que recorre el mouse sobre el pad para girar 360°. Es la única cifra que
          se puede copiar de Valorant a Counter-Strike, Fortnite o Aimlabs. El número de sensibilidad
          de cada juego es una escala distinta del mismo giro.
        </p>
        {health ? (
          <p>
            Con tus datos, {source.name} a {formatSens(setup.sens, source.decimals, source.unit)} y {setup.dpi} DPI
            son <strong>{formatNum(health.cm360, 2)} cm</strong>. El mismo giro en Counter-Strike 2 es{" "}
            <strong>{formatSens(mirrored, cs2.decimals, "")}</strong>.
          </p>
        ) : null}
      </section>

      <section>
        <h2>La fórmula</h2>
        <p className="formula">cm/360 = 914.4 / (DPI × sensibilidad × yaw)</p>
        <p>
          914.4 es 360° × 2.54 cm por pulgada. El yaw es cuántos grados gira el juego por cada cuenta
          del mouse cuando la sensibilidad vale 1. Para pasar de un juego a otro se conserva el cm/360
          y se despeja la sensibilidad del destino.
        </p>
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Yaw de cadera y banda habitual por juego</caption>
            <thead>
              <tr>
                <th>Juego</th>
                <th>Yaw</th>
                <th>Banda habitual</th>
              </tr>
            </thead>
            <tbody>
              {GAMES.map((game) => (
                <tr key={game.id}>
                  <td>{game.name}</td>
                  <td className="num">{formatYaw(game.yaw)}</td>
                  <td className="num">
                    {game.band[0]}–{game.band[1]} cm
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint">
          Yaw de cadera, el que usan los conversores públicos para igualar el giro. Fortnite entra como
          el número del eje X, el porcentaje del slider. Counter-Strike 2, Apex y otros derivados de
          Source comparten 0.022: el número se copia tal cual si el DPI no cambia.
        </p>
      </section>

      <section>
        <h2>eDPI</h2>
        <p>
          eDPI = DPI × sensibilidad. Sirve para comparar dos jugadores del mismo juego: 400 DPI × 0.8
          y 800 DPI × 0.4 son el mismo eDPI y el mismo giro ahí. No viaja. 320 eDPI en Valorant no es
          320 eDPI en Counter-Strike, porque el yaw es otro. Si alguien te pasa un eDPI de otro juego,
          pídele el cm/360.
        </p>
      </section>

      <section>
        <h2>Qué mide el finder</h2>
        <p>
          La distancia no sale de un formulario. Sale de rondas cortas que alternan tres actividades,
          con la mira en el centro. Giro parte de tu cm/360 y lo mueve según el sesgo a pasarte o a
          quedarte corto, con pasos que se achican. No promedia hacia el centro de la banda. Si el
          sesgo no se repite, se queda cerca de tu partida.
        </p>
        <ul>
          <li>Seguimiento. Una esfera se mueve con una trayectoria suave e impredecible. Hay que mantener la mira encima, sin clic. Roja, y azul mientras estás encima.</li>
          <li>Flicks rápidos. Esferas grandes en puntos al azar. Clic y aparece la siguiente.</li>
          <li>Flicks precisos. Lo mismo, con una esfera del tamaño de una cabeza.</li>
          <li>Si el flick se pasa del centro, la sensibilidad está alta (hay que subir los cm). Si se queda corto, está baja. Cuenta la magnitud del error, las microcorrecciones y el tiempo encima del blanco. Los pasos se achican; hace falta el mismo sesgo más de una ronda para converger.</li>
        </ul>
        <p>
          El rango de partida es la banda del juego. Si juegas a larga distancia o con armas de clic,
          Giro usa la mitad más lenta (más cm). Si juegas de cerca o haces tracking, la mitad más rápida.
          Conviene repetir la prueba en días distintos y promediar: el valor se mueve con el sueño y el estrés.
        </p>
      </section>

      <section>
        <h2>Mousepad</h2>
        <p>
          La prueba dura es geométrica. Un 180 tiene que entrar en el ancho útil del pad y dejar sitio
          para levantar el mouse. Si el 180 pide más centímetros que el pad, esa sensibilidad no se
          puede jugar: te quedas mirando atrás a medias. Si el 180 ocupa menos del 20% del pad, cabe,
          pero el temblor se amplifica.
        </p>
      </section>

      <section>
        <h2>Cuentas por grado</h2>
        <p>
          El sensor no mide continuo. Manda cuentas. Cuentas por grado = 1 / (sensibilidad × yaw). Si
          hay menos de 8, el aim va a saltos. Subir el DPI y bajar la sensibilidad del juego conserva
          el cm/360 y añade cuentas. 800 o 1600 DPI suele ser el punto donde el mismo giro queda fino.
          El polling no entra en esta cuenta: 1000 Hz es suficiente para el giro, y bajarlo no cambia
          la distancia.
        </p>
      </section>

      <section>
        <h2>Bandas</h2>
        <p>
          Menos de 25 cm es muñeca. De 25 a 45 cm es híbrida. Por encima de 45 cm es brazo. En tac FPS
          la mayoría competitiva vive entre 30 y 55 cm. En Fortnite el rango habitual es más rápido,
          porque el edificio pide giros cortos. Estar fuera de la banda no invalida el número. Solo
          dice que estás lejos de lo que usa ese juego.
        </p>
      </section>

      <section>
        <h2>FOV y ADS</h2>
        <p>
          El FOV es cuántos grados ve la cámara. El mismo cm/360 se siente más rápido si el FOV es más
          estrecho, porque el swipe cubre más pantalla. Giro no te pide el FOV: usa el valor típico de
          cada juego y pone esa cámara. Valorant queda en 103° horizontal (16:9). Counter-Strike 2 y
          Apex, 90° en 4:3, unos 106.3° en 16:9. Overwatch 2, 103°. Fortnite, 80°. Call of Duty, 80°.
        </p>
        <p>
          La mira, el visor y el coeficiente de monitor son otro ajuste. Este banco no los convierte.
          Iguala primero la cadera. Después, en el juego, deja el multiplicador de ADS donde el
          seguimiento a esa distancia de zoom te cuadre. En Valorant, el coeficiente 1 no es “el mismo
          cm/360 en la mira”: mezcla el FOV del zoom con tu preferencia.
        </p>
      </section>

      <section>
        <h2>Windows y el mouse en el navegador</h2>
        <p>
          El cm/360 del juego asume raw input. Giro pide al navegador el movimiento sin ajustar
          (unadjustedMovement), el equivalente de raw input en Chrome: cada cuenta del mouse gira
          sensibilidad × yaw grados, sin multiplicar por la escala de pantalla. Si el navegador
          rechaza esa opción, se usa movementX en píxeles CSS y se corrige con devicePixelRatio.
          En Windows, puntero 6/11 y “mejorar la precisión del puntero” apagado. Si la aceleración
          está activa, la distancia deja de ser lineal.
        </p>
      </section>
    </article>
  );
}
