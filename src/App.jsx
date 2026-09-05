import { useState, useEffect, useCallback, useRef } from "react";
import {
  Plus, MessageCircle, Users, Home, Check, X, Trash2, Phone, ChevronLeft,
  AlertCircle, Camera, Upload, FileText, Briefcase, MapPin, UserCog, Loader2,
  BookOpen, Pencil, ChevronUp, ChevronDown, Info, Snowflake, Contact,
} from "lucide-react";

/* ---------------- utilidades de fecha ---------------- */

const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_SEMANA_ORDEN = [1, 2, 3, 4, 5, 6, 0];
const MESES_LARGOS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const RANGO_ESTADO = { vencido: 3, atrasado: 2, aldia: 1, sinIntereses: 0, liquidado: -1 };

function toISO(d) { return d.toISOString().slice(0, 10); }
function parseISO(iso) { return new Date(iso + "T00:00:00"); }
function addDays(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function ultimoDiaMes(year, monthIndex) { return new Date(year, monthIndex + 1, 0).getDate(); }

function nextWeekdaySingle(from, weekday, strictlyAfter) {
  let d = new Date(from);
  if (strictlyAfter) d = addDays(d, 1);
  while (d.getDay() !== weekday) d = addDays(d, 1);
  return d;
}

function nextWeekdayMulti(from, dias, strictlyAfter) {
  if (!dias || dias.length === 0) return nextWeekdaySingle(from, from.getDay(), strictlyAfter);
  let d = new Date(from);
  if (strictlyAfter) d = addDays(d, 1);
  for (let i = 0; i < 8; i++) {
    if (dias.includes(d.getDay())) return d;
    d = addDays(d, 1);
  }
  return d;
}

function nextIntervaloSemanal(from, frecuencia, origen, strictlyAfter) {
  const intervaloDias = Math.max(1, Number(frecuencia.intervaloSemanas) || 1) * 7;
  const offsetDias = Math.max(0, Number(frecuencia.offsetInicial) || 0) * 7;
  const base = addDays(nextWeekdaySingle(origen, frecuencia.diaSemana, false), offsetDias);
  const diffDias = Math.round((from - base) / 86400000);
  let pasos = Math.floor(diffDias / intervaloDias);
  if (pasos < 0) pasos = 0;
  let cand = addDays(base, pasos * intervaloDias);
  let guard = 0;
  while ((strictlyAfter ? cand <= from : cand < from) && guard < 500) {
    cand = addDays(cand, intervaloDias);
    guard++;
  }
  return cand;
}

function nextQuincena(from, strictlyAfter) {
  const year = from.getFullYear(), month = from.getMonth();
  const last = ultimoDiaMes(year, month);
  const candidatos = [15, last].filter((v, i, a) => a.indexOf(v) === i).sort((a, b) => a - b);
  for (const c of candidatos) {
    const cand = new Date(year, month, c);
    if (strictlyAfter ? cand > from : cand >= from) return cand;
  }
  const nm = month + 1, ny = nm > 11 ? year + 1 : year, nmi = nm % 12;
  return new Date(ny, nmi, 15);
}

function nextFechasMes(from, fechas, strictlyAfter) {
  if (!fechas || fechas.length === 0) return nextMensual(from, { mesModo: "origen" }, from, strictlyAfter);
  let year = from.getFullYear(), month = from.getMonth();
  for (let iter = 0; iter < 24; iter++) {
    const last = ultimoDiaMes(year, month);
    const candidatosMes = [...new Set(fechas.map((f) => Math.min(f, last)))].sort((a, b) => a - b);
    for (const d of candidatosMes) {
      const cand = new Date(year, month, d);
      if (strictlyAfter ? cand > from : cand >= from) return cand;
    }
    month++; if (month > 11) { month = 0; year++; }
  }
  return from;
}

function nextMensual(from, frecuencia, origen, strictlyAfter) {
  const objetivo = frecuencia.mesModo === "custom" ? frecuencia.diaMes : origen.getDate();
  function build(y, m) {
    const last = ultimoDiaMes(y, m);
    const dia = objetivo === "ultimo" ? last : Math.min(Number(objetivo), last);
    return new Date(y, m, dia);
  }
  let cand = build(from.getFullYear(), from.getMonth());
  if (strictlyAfter ? cand > from : cand >= from) return cand;
  const nm = from.getMonth() + 1, ny = nm > 11 ? from.getFullYear() + 1 : from.getFullYear(), nmi = nm % 12;
  return build(ny, nmi);
}

function calcularSiguientePago(fromISO, frecuencia, fechaOrigenISO, strictlyAfter) {
  const from = parseISO(fromISO);
  const origen = parseISO(fechaOrigenISO);
  let resultado;
  if (frecuencia.tipo === "semanal") resultado = nextWeekdaySingle(from, frecuencia.diaSemana, strictlyAfter);
  else if (frecuencia.tipo === "personalizado" && frecuencia.personalizadoModo === "fechasMes") resultado = nextFechasMes(from, frecuencia.fechasMes, strictlyAfter);
  else if (frecuencia.tipo === "personalizado" && frecuencia.personalizadoModo === "intervaloSemanal") resultado = nextIntervaloSemanal(from, frecuencia, origen, strictlyAfter);
  else if (frecuencia.tipo === "personalizado") resultado = nextWeekdayMulti(from, frecuencia.diasSemana, strictlyAfter);
  else if (frecuencia.tipo === "quincenal") resultado = nextQuincena(from, strictlyAfter);
  else resultado = nextMensual(from, frecuencia, origen, strictlyAfter);
  return toISO(resultado);
}

function descripcionFrecuencia(f) {
  if (f.tipo === "semanal") return `Semanal · cada ${DIAS_SEMANA[f.diaSemana]}`;
  if (f.tipo === "personalizado" && f.personalizadoModo === "fechasMes") return `Personalizado · días ${(f.fechasMes || []).join(", ") || "sin definir"} de cada mes`;
  if (f.tipo === "personalizado" && f.personalizadoModo === "intervaloSemanal") return `Personalizado · cada ${f.intervaloSemanas} semanas, los ${DIAS_SEMANA[f.diaSemana]}`;
  if (f.tipo === "personalizado") return `Personalizado · ${(f.diasSemana || []).map((d) => DIAS_SEMANA[d]).join(", ") || "sin días"}`;
  if (f.tipo === "quincenal") return "Quincenal · días 15 y último de mes";
  if (f.mesModo === "custom") return `Mensual · día ${f.diaMes === "ultimo" ? "último" : f.diaMes} de cada mes`;
  return "Mensual · mismo día del préstamo";
}

function pagosPorMes(f) {
  if (f.tipo === "semanal") return 4;
  if (f.tipo === "quincenal") return 2;
  if (f.tipo === "personalizado" && f.personalizadoModo === "fechasMes") return Math.max(1, (f.fechasMes || []).length);
  if (f.tipo === "personalizado" && f.personalizadoModo === "intervaloSemanal") return Math.max(1, Math.round(4 / (Number(f.intervaloSemanas) || 2)));
  if (f.tipo === "personalizado") return Math.max(1, (f.diasSemana || []).length * 4);
  return 1;
}

function fmtMoney(n) { return "$" + Number(n || 0).toLocaleString("es-MX", { maximumFractionDigits: 0 }); }
function fmtDate(iso) { return parseISO(iso).toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" }); }
function diasHasta(iso) { const hoy = new Date(); hoy.setHours(0, 0, 0, 0); return Math.round((parseISO(iso) - hoy) / 86400000); }
// Estado del préstamo según cuántos MESES de interés acumulado se deben, en relación a
// UN periodo (interesMensualDe). Ejemplo con un préstamo al 20% mensual ($1,000/mes):
//  - 0 pendiente (recién otorgado, o recién cubierto todo el atraso) -> "sinIntereses"
//  - hasta 1 mes acumulado sin cubrir ($1,000) -> "aldia"
//  - más de 1 mes y hasta 3 meses acumulados sin cubrir -> "atrasado"
//  - más de 3 meses acumulados sin cubrir -> "vencido"
function estadoCliente(prestamo, hoyISO) {
  const interesMensual = interesMensualDe(prestamo);
  if (interesMensual <= 0) return "sinIntereses";
  const pendiente = interesPendienteDe(prestamo, hoyISO || toISO(new Date()));
  if (pendiente <= 0) return "sinIntereses";
  const mesesAcumulados = pendiente / interesMensual;
  if (mesesAcumulados <= 1) return "aldia";
  if (mesesAcumulados <= 3) return "atrasado";
  return "vencido";
}
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function monthLabel(key) { const [y, m] = key.split("-"); return `${MESES_LARGOS[Number(m) - 1]} ${y}`; }

/* ---------------- adeudo, interés e intereses pagados ---------------- */
// "Préstamo" = únicamente la cantidad prestada (capital). "Adeudo" = capital pendiente
// + interés generado (según el % mensual) desde la fecha del préstamo hasta hoy,
// menos los pagos de interés ya realizados.

function interesMensualDe(prestamo) {
  return Math.round((Number(prestamo.monto || 0) * Number(prestamo.tasaInteres || 0)) / 100);
}

// El capital REALMENTE prestado al cliente, que nunca cambia con el tiempo. Al congelar
// (reestructurar) un préstamo, `prestamo.monto` se actualiza para reflejar la nueva deuda
// pactada (capital + interés pendiente en ese momento), así que ya no sirve para saber
// cuánto dinero salió originalmente. `montoOriginal` sí se conserva siempre; los préstamos
// creados antes de que existiera este campo no lo tienen, así que se recurre a `monto`.
function montoOriginalDe(prestamo) {
  return prestamo.montoOriginal != null ? Number(prestamo.montoOriginal) : Number(prestamo.monto || 0);
}

// Si el préstamo fue reestructurado, el interés se cuenta desde esa fecha (no desde el
// origen), porque los términos (capital y/o tasa) cambiaron a partir de ahí.
function anclaInteresDe(prestamo) {
  return prestamo.reestructuradoDesde || prestamo.fechaOrigen;
}

// Si el préstamo está congelado, el cálculo de interés no avanza más allá de la fecha en
// que se congeló, sin importar qué tan adelante esté "hoy".
function finCalculoInteres(prestamo, hoyISO) {
  const hoy = hoyISO || toISO(new Date());
  if (prestamo.congelado && prestamo.congeladoDesde && prestamo.congeladoDesde < hoy) return prestamo.congeladoDesde;
  return hoy;
}

function pagosInteresHistorial(prestamo) {
  // Si hubo una reestructuración, los pagos de interés anteriores a esa fecha ya
  // corresponden al esquema anterior y no deben restarse del interés generado bajo el
  // nuevo esquema.
  const desde = prestamo.reestructuradoDesde || null;
  return (prestamo.historial || []).reduce((s, h) => {
    if (desde && h.fecha < desde) return s;
    // Pagos nuevos ya traen el desglose interés/capital (interesMonto). Los pagos
    // antiguos, registrados antes de repartir el pago entre interés y capital, no lo
    // traen; para esos se conserva el comportamiento previo de contar todo como interés.
    if (h.tipo === "parcial" || h.tipo === "completo") return s + (h.interesMonto != null ? Number(h.interesMonto) : Number(h.monto || 0));
    if (h.tipo === "liquidado") return s + Number(h.interesMonto || 0);
    return s;
  }, 0);
}

function addMonths(d, n) {
  const total = d.getMonth() + n;
  const year = d.getFullYear() + Math.floor(total / 12);
  const month = ((total % 12) + 12) % 12;
  const day = Math.min(d.getDate(), ultimoDiaMes(year, month));
  return new Date(year, month, day);
}

// Cuántos meses de interés se han generado desde el origen del préstamo hasta hoy.
// El interés del primer mes se cobra COMPLETO desde el día 1 (el cliente ya está usando
// el dinero desde ese momento), por eso el conteo arranca en 1 en cuanto existe el
// préstamo, y no hasta que se cumple un mes calendario completo. A partir de ahí, cada
// aniversario mensual (respetando el día de origen) suma un mes más.
function mesesInteresGenerados(origen, hoy) {
  let meses = 1;
  while (addMonths(origen, meses) <= hoy) meses++;
  return meses;
}

// Interés total generado desde el origen del préstamo hasta hoy, restando el interés que
// ya se ha pagado (pagos parciales/completos + interés cobrado en liquidaciones previas).
function interesPendienteDe(prestamo, hoyISO) {
  const hoy = parseISO(finCalculoInteres(prestamo, hoyISO || toISO(new Date())));
  hoy.setHours(0, 0, 0, 0);
  const origen = parseISO(anclaInteresDe(prestamo));
  const interesMensual = interesMensualDe(prestamo);
  const meses = mesesInteresGenerados(origen, hoy);
  const interesAcumulado = interesMensual * meses;

  const pagosInteres = pagosInteresHistorial(prestamo);
  return Math.max(0, Math.round(interesAcumulado - pagosInteres));
}

// Interés generado (acumulado) desde el origen hasta hoy, SIN restar pagos ya hechos.
// Es la misma cuenta de meses que usa interesPendienteDe, pero aquí se necesita el bruto
// para poder comparar "cuánto se ha generado" contra "cuánto se ha recuperado".
function interesGeneradoHastaHoy(prestamo, hoyISO) {
  const hoy = parseISO(finCalculoInteres(prestamo, hoyISO || toISO(new Date())));
  hoy.setHours(0, 0, 0, 0);
  const origen = parseISO(anclaInteresDe(prestamo));
  const interesMensual = interesMensualDe(prestamo);
  return interesMensual * mesesInteresGenerados(origen, hoy);
}

function calcularAdeudoActualizado(prestamo, hoyISO) {
  if (prestamo.liquidado) return 0;
  const capitalPendiente = prestamo.capitalPendiente == null ? Number(prestamo.monto || 0) : Number(prestamo.capitalPendiente);
  return Math.round(capitalPendiente + interesPendienteDe(prestamo, hoyISO));
}

// Resumen financiero de UN solo préstamo, a la fecha de consulta: cuántos pagos se han
// hecho y su suma, cuánto de eso le corresponde al prestador auxiliar (si tiene), cuánto
// queda después de esa comisión, la ganancia después de comisiones (lo recibido menos el
// capital prestado y la comisión) y el % del préstamo recuperado a la fecha. Usa la misma
// lógica que el desglose por auxiliar y las estadísticas del libro, pero para un solo
// préstamo, para que las cifras cuadren en toda la app.
function resumenFinancieroPrestamo(prestamo, hoyISO) {
  const historialPagos = (prestamo.historial || []).filter((h) => h.tipo !== "reestructuracion");
  const numPagos = historialPagos.length;
  const totalPagado = historialPagos.reduce((s, h) => s + Number(h.monto || 0), 0);
  const totalAuxiliar = historialPagos.reduce((s, h) => s + Number(h.auxiliarMonto || 0), 0);
  const recibidoDespuesComisiones = totalPagado - totalAuxiliar;
  // La ganancia real siempre se compara contra el capital ORIGINALMENTE prestado (nunca
  // contra `monto`, que al congelar el préstamo se actualiza a la nueva deuda pactada).
  // Así, todo lo cobrado antes Y después de congelar -incluido el interés que ya se había
  // generado y quedó incorporado a la nueva deuda- cuenta como ganancia real.
  const gananciaDespuesComisiones = totalPagado - montoOriginalDe(prestamo) - totalAuxiliar;

  const capitalPendienteP = prestamo.liquidado ? 0 : (prestamo.capitalPendiente == null ? Number(prestamo.monto || 0) : Number(prestamo.capitalPendiente));
  const capitalRecuperado = Number(prestamo.monto || 0) - capitalPendienteP;
  let totalEsperado, totalRecuperado;
  if (prestamo.congelado) {
    totalEsperado = Number(prestamo.monto || 0);
    totalRecuperado = capitalRecuperado;
  } else {
    totalEsperado = Number(prestamo.monto || 0) + interesGeneradoHastaHoy(prestamo, hoyISO);
    totalRecuperado = capitalRecuperado + pagosInteresHistorial(prestamo);
  }
  const pctRecuperado = totalEsperado > 0 ? Math.round((totalRecuperado / totalEsperado) * 100) : 0;

  return { numPagos, totalPagado, totalAuxiliar, recibidoDespuesComisiones, gananciaDespuesComisiones, pctRecuperado, totalEsperado, totalRecuperado };
}

// Reparte un pago ("parcial" o "completo"): TODO el monto se aplica al interés pendiente,
// nunca al capital. Si el monto pagado excede el interés pendiente a la fecha (un abono
// fuerte), el sobrante no se pierde ni reduce el capital: queda como interés pagado por
// adelantado, y se va absorbiendo solo conforme se generan los siguientes meses de interés
// (interesPendienteDe resta el acumulado de pagos contra el interés generado a la fecha).
// El capital prestado (capitalPendiente) NUNCA baja por un pago parcial o "completo": solo
// se salda con una Liquidación total, que es la única acción pensada para cerrar el
// préstamo. Así, mientras el cliente no liquide, su adeudo siempre puede reconstruirse como:
// capital original + interés generado a la fecha - total de interés pagado (incluidos los
// adelantos), y nunca baja del capital original salvo que se liquide.
function splitPago(prestamo, monto, fechaPago) {
  const montoNum = Number(monto || 0);
  const capitalPendienteAntes = prestamo.capitalPendiente == null ? Number(prestamo.monto || 0) : Number(prestamo.capitalPendiente);
  return { interesAplicado: Math.round(montoNum), capitalAplicado: 0, nuevoCapitalPendiente: Math.round(capitalPendienteAntes) };
}

/* ---------------- préstamos congelados: cobro por cuota fija, sin interés ---------------- */
// Al congelar (reestructurar) un préstamo, este deja de generar interés y pasa a cobrarse
// en cuotas fijas (prestamo.cuota) según la frecuencia pactada. Por eso, a diferencia de un
// préstamo normal (donde el pago se aplica al interés y el capital solo baja al liquidar),
// aquí CADA pago —parcial o completo— se aplica directamente al capital pendiente, que es
// la única cifra que compone la deuda. Estas funciones son el equivalente, para préstamos
// congelados, de interesPendienteDe/interesMensualDe/estadoCliente en préstamos normales.

// Cuántas cuotas ya "generaron su turno de cobro" desde que se congeló el préstamo hasta
// hoy. La primera cuota está disponible para cobro desde el día 1 (se puede pagar por
// adelantado), igual que el interés del primer mes en un préstamo normal.
function cuotasGeneradasCongelado(prestamo, hoyISO) {
  const origen = parseISO(prestamo.congeladoDesde || prestamo.reestructuradoDesde || prestamo.fechaOrigen);
  const hoy = parseISO(hoyISO || toISO(new Date()));
  hoy.setHours(0, 0, 0, 0);
  return mesesInteresGenerados(origen, hoy);
}

// Suma del capital ya cubierto por pagos registrados desde que se congeló el préstamo
// (todo pago a un préstamo congelado se aplica 100% a capital, ver splitPagoCongelado).
// El primer pago dado en el momento mismo de congelar (marcado con
// `esPrimerPagoAlCongelar`) queda FUERA de esta suma a propósito: ese pago ya se restó
// una sola vez de la "nueva deuda" (y por lo tanto del capital pendiente) al momento de
// congelar, y es independiente de las cuotas que se van generando por fecha. Si se
// contara aquí también, se estaría descontando dos veces y las cuotas futuras
// aparecerían como ya cubiertas por adelantado sin haberse pagado. Solo los abonos con
// "Otra cantidad" hechos DESPUÉS de congelar deben restarse de lo exigible por fecha.
function pagosCapitalHistorialCongelado(prestamo) {
  const desde = prestamo.reestructuradoDesde || prestamo.congeladoDesde || null;
  return (prestamo.historial || []).reduce((s, h) => {
    if (desde && h.fecha < desde) return s;
    if (h.esPrimerPagoAlCongelar) return s;
    if (h.tipo === "parcial" || h.tipo === "completo") return s + Number(h.capitalMonto != null ? h.capitalMonto : h.monto || 0);
    if (h.tipo === "liquidado") return s + Number(h.capitalMonto || 0);
    return s;
  }, 0);
}

// Cuánto debe cobrar un "Pago completo" en un préstamo congelado a la fecha:
//  - Si hay una o varias cuotas atrasadas, cobra TODO lo atrasado de una sola vez (igual
//    que "Pago completo" cubre todo el interés atrasado en un préstamo normal).
//  - Si el préstamo está al corriente (nada atrasado) pero aún quedan cuotas por vencer,
//    permite cobrar la siguiente cuota por adelantado.
//  - Si antes de la fecha límite ya se cubrió una parte de la cuota en curso con abonos
//    ("Otra cantidad"), el restante mostrado es solo lo que falta para completarla.
function cuotaPendienteCongelado(prestamo, hoyISO) {
  const cuota = Number(prestamo.cuota || 0);
  const capitalRestante = Math.max(0, Number(prestamo.capitalPendiente == null ? prestamo.monto : prestamo.capitalPendiente));
  if (capitalRestante <= 0 || cuota <= 0) return 0;
  const cuotasGeneradas = cuotasGeneradasCongelado(prestamo, hoyISO);
  const acumuladoExigible = Math.min(cuota * cuotasGeneradas, Number(prestamo.monto || 0));
  const pagado = pagosCapitalHistorialCongelado(prestamo);
  const atrasado = Math.max(0, Math.round(acumuladoExigible - pagado));
  if (atrasado > 0) return Math.min(atrasado, capitalRestante);
  return Math.min(cuota, capitalRestante); // al corriente: se permite cobrar la siguiente cuota por adelantado
}

// Monto que corresponde a "Pago completo": la cuota (o lo atrasado) en préstamos
// congelados; el interés pendiente de pago en préstamos normales.
function montoPagoCompleto(prestamo, hoyISO) {
  return prestamo.congelado ? cuotaPendienteCongelado(prestamo, hoyISO) : interesPendienteDe(prestamo, hoyISO);
}

// Reparte un pago en un préstamo CONGELADO: al no haber interés, el 100% del monto pagado
// se aplica al capital pendiente, y por lo tanto el adeudo actualizado baja de inmediato.
function splitPagoCongelado(prestamo, monto) {
  const montoNum = Math.round(Number(monto || 0));
  const capitalPendienteAntes = Math.max(0, Number(prestamo.capitalPendiente == null ? prestamo.monto : prestamo.capitalPendiente));
  const capitalAplicado = Math.min(montoNum, capitalPendienteAntes);
  return { interesAplicado: 0, capitalAplicado, nuevoCapitalPendiente: Math.max(0, Math.round(capitalPendienteAntes - capitalAplicado)) };
}

// Estado de un préstamo CONGELADO: solo dos posibilidades, "Al día" (la cuota va al
// corriente) o "Atrasado" (ya se pasó la fecha establecida de cobro sin cubrirla).
function estadoCongelado(prestamo, hoyISO) {
  const hoy = hoyISO || toISO(new Date());
  if (prestamo.proximoPago && prestamo.proximoPago < hoy && cuotaPendienteCongelado(prestamo, hoy) > 0) return "atrasado";
  return "aldia";
}

// Punto único para obtener el estado de un préstamo (normal o congelado), usado en toda
// la interfaz en vez de llamar a estadoCliente directamente.
function estadoDe(prestamo, hoyISO) {
  if (prestamo.liquidado) return "liquidado";
  if (prestamo.congelado) return estadoCongelado(prestamo, hoyISO);
  return estadoCliente(prestamo, hoyISO);
}

// Calcula cuánto le corresponde al prestador auxiliar en un pago dado.
// - Si el préstamo tiene un bono pendiente por "primer pago" (auxiliarBonoPendiente,
//   pactado al congelar/reestructurar) y no se cubre completo con este pago, el restante
//   se sigue cobrando de los pagos siguientes hasta agotarse.
// - Si no hay bono pendiente: en préstamos normales, el % de comisión se calcula sobre el
//   interés del pago. En préstamos CONGELADOS, el % de comisión se calcula sobre el monto
//   pagado y se le da su parte al auxiliar en CADA pago que haga el deudor —ya sea "Pago
//   completo", un abono con "Otra cantidad" o una liquidación total—, no solo en las
//   cuotas mensuales de "Pago completo".
function calcularAuxiliarMonto(prestamo, montoPagado, interesDelPago, tipoPago) {
  const bonoPendiente = Number(prestamo.auxiliarBonoPendiente || 0);
  if (bonoPendiente > 0) {
    const cobrado = Math.round(Math.min(bonoPendiente, montoPagado));
    return { auxiliarMonto: cobrado, bonoRestante: Math.max(0, Math.round(bonoPendiente - cobrado)) };
  }
  if (!prestamo.auxiliar) return { auxiliarMonto: 0, bonoRestante: 0 };
  if (prestamo.congelado) {
    return { auxiliarMonto: Math.round((montoPagado * prestamo.auxiliar.porcentaje) / 100), bonoRestante: 0 };
  }
  return { auxiliarMonto: Math.round((interesDelPago * prestamo.auxiliar.porcentaje) / 100), bonoRestante: 0 };
}

// Un "Pago completo" ahora cubre TODO el interés atrasado, no solo un periodo. Por eso la
// fecha de "próximo pago" debe recalcularse avanzando tantos periodos del calendario como
// hagan falta para dejarla después de la fecha del pago — si el cliente debía, por
// ejemplo, 3 periodos y los cubre de una sola vez, la agenda debe saltar directo al
// periodo que sigue después de hoy, no solo avanzar uno por cada clic.
function avanzarProximoPago(prestamo, fechaPago) {
  let siguiente = calcularSiguientePago(prestamo.proximoPago, prestamo.frecuencia, prestamo.fechaOrigen, true);
  while (siguiente <= fechaPago) {
    siguiente = calcularSiguientePago(siguiente, prestamo.frecuencia, prestamo.fechaOrigen, true);
  }
  return siguiente;
}

const ESTADO_CFG = {
  vencido: { label: "VENCIDO", color: "var(--red)", bg: "rgba(221,92,78,0.14)" },
  atrasado: { label: "ATRASADO", color: "var(--gold)", bg: "rgba(227,162,60,0.16)" },
  aldia: { label: "AL DÍA", color: "var(--green)", bg: "rgba(111,162,132,0.16)" },
  sinIntereses: { label: "SIN INTERESES", color: "#6B8CAE", bg: "rgba(107,140,174,0.16)" },
  liquidado: { label: "LIQUIDADO", color: "var(--muted)", bg: "rgba(139,152,165,0.16)" },
};

// Colorimetría de las casillas de préstamo: un contorno neón tenue ("poca luz") según el
// estado, usando el mismo color que su etiqueta (Stamp). Un préstamo CONGELADO siempre
// muestra un contorno color "hielo" fijo (escarchado), sin importar su estado (al día o
// atrasado), y solo deja de mostrarlo cuando se liquida —momento en el que pasa a usar el
// contorno gris de "liquidado" como cualquier otro préstamo.
const ESTADO_GLOW_RGB = {
  vencido: "221,92,78",
  atrasado: "227,162,60",
  aldia: "111,162,132",
  sinIntereses: "107,140,174",
  liquidado: "139,152,165",
};
const HIELO_COLOR = "#BEEFFF";
const HIELO_RGB = "170,232,255";

// Estilo de contorno según estado, reutilizable tanto para un préstamo
// individual como para tarjetas que resumen varios préstamos (Inicio,
// Clientes). Si `congelado` es true, siempre gana el contorno "hielo" sin
// importar el estado —salvo que ya esté liquidado, ese caso no debe llegar
// aquí con congelado=true (ver llamadores).
function estadoGlowStyle(estado, congelado) {
  if (congelado) {
    return {
      border: `1.5px solid ${HIELO_COLOR}`,
      boxShadow: `0 0 4px rgba(${HIELO_RGB},0.55), 0 0 13px rgba(${HIELO_RGB},0.30), inset 0 0 9px rgba(${HIELO_RGB},0.12)`,
    };
  }
  const cfg = ESTADO_CFG[estado] || ESTADO_CFG.aldia;
  const rgb = ESTADO_GLOW_RGB[estado] || ESTADO_GLOW_RGB.aldia;
  return {
    border: `1.5px solid ${cfg.color}`,
    boxShadow: `0 0 4px rgba(${rgb},0.5), 0 0 12px rgba(${rgb},0.28)`,
  };
}

function prestamoGlowStyle(prestamo, hoyISO) {
  const congelado = !!(prestamo.congelado && !prestamo.liquidado);
  return estadoGlowStyle(estadoDe(prestamo, hoyISO), congelado);
}

// Peor estado (y si hay algún congelado) entre una lista de préstamos, para
// colorear tarjetas que agrupan varios préstamos de un mismo cliente o
// auxiliar (Inicio, Clientes).
function peorEstadoDeLista(lista, hoyISO) {
  const estado = lista.reduce((peor, p) => {
    const e = estadoDe(p, hoyISO);
    return RANGO_ESTADO[e] > RANGO_ESTADO[peor] ? e : peor;
  }, "sinIntereses");
  const congelado = lista.some((p) => p.congelado && !p.liquidado);
  return { estado, congelado };
}

function Stamp({ estado }) {
  const cfg = ESTADO_CFG[estado] || ESTADO_CFG.aldia;
  return (
    <span style={{
      display: "inline-block", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700,
      letterSpacing: "0.08em", color: cfg.color, background: cfg.bg, border: `1.5px dashed ${cfg.color}`,
      borderRadius: 5, padding: "3px 8px", transform: "rotate(-2.5deg)", whiteSpace: "nowrap",
    }}>{cfg.label}</span>
  );
}

// Detalle visual (copo de nieve) para detectar de un vistazo que un préstamo está
// congelado, además del contorno "hielo" de la casilla. Desaparece en cuanto se liquida.
function CongeladoBadge() {
  return (
    <span
      title="Préstamo congelado"
      style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0,
        background: "rgba(170,232,255,0.14)", border: `1.5px solid ${HIELO_COLOR}`, color: HIELO_COLOR,
        boxShadow: `0 0 4px rgba(${HIELO_RGB},0.55), 0 0 10px rgba(${HIELO_RGB},0.3)`,
      }}
    >
      <Snowflake size={13} />
    </span>
  );
}

function waLink(telefono10, mensaje) {
  const digits = (telefono10 || "").replace(/\D/g, "");
  return `https://wa.me/52${digits}?text=${encodeURIComponent(mensaje)}`;
}

function mensajeRecordatorio(cliente, prestamo) {
  const dias = diasHasta(prestamo.proximoPago);
  let linea;
  if (dias < 0) linea = `tu pago de ${fmtMoney(prestamo.cuota)} venció el ${fmtDate(prestamo.proximoPago)}`;
  else if (dias === 0) linea = `tu pago de ${fmtMoney(prestamo.cuota)} vence hoy`;
  else linea = `tu pago de ${fmtMoney(prestamo.cuota)} vence el ${fmtDate(prestamo.proximoPago)}`;
  const hoyISO = toISO(new Date());
  const adeudoActualizado = calcularAdeudoActualizado(prestamo, hoyISO);
  const pendienteAtrasado = montoPagoCompleto(prestamo, hoyISO);
  const lineaAtraso = pendienteAtrasado > 0 && pendienteAtrasado > Number(prestamo.cuota || 0)
    ? ` Para ponerte al corriente con lo atrasado se necesitan ${fmtMoney(pendienteAtrasado)}.`
    : "";
  const lineaLiquidar = !prestamo.liquidado ? ` Si quieres liquidar tu préstamo por completo, el adeudo actualizado es de ${fmtMoney(adeudoActualizado)}.` : "";
  return `Hola ${cliente.nombre.split(" ")[0]}, te recuerdo que ${linea}.${lineaAtraso}${lineaLiquidar} ¡Gracias!`;
}

function mensajeRecordatorioGrupo(cliente, prestamos) {
  if (prestamos.length === 1) return mensajeRecordatorio(cliente, prestamos[0]);
  const hoyISO = toISO(new Date());
  const lineas = prestamos.map((p) => `- ${fmtMoney(p.cuota)} (vence ${fmtDate(p.proximoPago)})`).join("\n");
  const total = prestamos.reduce((s, p) => s + Number(p.cuota), 0);
  const totalAdeudo = prestamos.reduce((s, p) => s + calcularAdeudoActualizado(p, hoyISO), 0);
  const totalAtrasado = prestamos.reduce((s, p) => s + montoPagoCompleto(p, hoyISO), 0);
  const lineaAtraso = totalAtrasado > total ? `\nPara ponerte al corriente con lo atrasado de todos: ${fmtMoney(totalAtrasado)}.` : "";
  return `Hola ${cliente.nombre.split(" ")[0]}, te recuerdo que tienes los siguientes pagos pendientes:\n${lineas}\n\nTotal: ${fmtMoney(total)}.${lineaAtraso}\nSi quieres liquidar todo por completo, el adeudo actualizado es de ${fmtMoney(totalAdeudo)}. ¡Gracias!`;
}

function mensajeRecordatorioAuxiliar(cliente, prestamo) {
  const mensajeCliente = mensajeRecordatorio(cliente, prestamo);
  const primerNombreAux = (prestamo.auxiliar.nombre || "").split(" ")[0];
  const hoyISO = toISO(new Date());
  const adeudoActualizado = calcularAdeudoActualizado(prestamo, hoyISO);
  const pendienteAtrasado = montoPagoCompleto(prestamo, hoyISO);
  return `Hola ${primerNombreAux}, te comparto los datos del cliente a tu cargo para que le des seguimiento a su pago:

Cliente: ${cliente.nombre}
Teléfono: ${cliente.telefono}
Préstamo otorgado el: ${fmtDate(prestamo.fechaOrigen)}
Pago solicitado: ${fmtMoney(prestamo.cuota)}
Fecha límite de pago: ${fmtDate(prestamo.proximoPago)}
Pago para ponerse al corriente con lo atrasado: ${fmtMoney(pendienteAtrasado)}
Adeudo actualizado (para liquidar por completo): ${fmtMoney(adeudoActualizado)}

Es importante que le recuerdes la importancia de pagar a tiempo para mantener su buen historial. Puedes copiar y reenviarle este mensaje directamente:

"${mensajeCliente}"`;
}

function mensajeRecordatorioAuxiliarGrupo(cliente, prestamos) {
  if (prestamos.length === 1) return mensajeRecordatorioAuxiliar(cliente, prestamos[0]);
  const primerNombreAux = (prestamos[0].auxiliar.nombre || "").split(" ")[0];
  const hoyISO = toISO(new Date());
  const lineas = prestamos.map((p) => `- ${fmtMoney(p.cuota)} (vence ${fmtDate(p.proximoPago)})`).join("\n");
  const total = prestamos.reduce((s, p) => s + Number(p.cuota), 0);
  const totalAdeudo = prestamos.reduce((s, p) => s + calcularAdeudoActualizado(p, hoyISO), 0);
  const totalAtrasado = prestamos.reduce((s, p) => s + montoPagoCompleto(p, hoyISO), 0);
  return `Hola ${primerNombreAux}, te comparto los pagos pendientes del cliente a tu cargo:

Cliente: ${cliente.nombre}
Teléfono: ${cliente.telefono}
${lineas}
Total: ${fmtMoney(total)}
Pago para ponerse al corriente con lo atrasado: ${fmtMoney(totalAtrasado)}
Adeudo actualizado (para liquidar todo por completo): ${fmtMoney(totalAdeudo)}

Recuérdale la importancia de pagar a tiempo. Puedes copiar y reenviarle este mensaje:

"${mensajeRecordatorioGrupo(cliente, prestamos)}"`;
}

function auxiliaresUnicosDeLista(prestamos) {
  const map = {};
  prestamos.forEach((p) => { if (p.auxiliar && p.auxiliar.telefono) map[p.auxiliar.telefono] = p.auxiliar; });
  return Object.values(map);
}

// Agrupa la lista de pendientes ({prestamo, cliente}) por teléfono del prestador auxiliar,
// y dentro de cada auxiliar, por cliente. Sirve para armar el resumen consolidado que se le
// envía a cada auxiliar con todos los clientes que tiene a su cargo y que tienen deuda.
function agruparPendientesPorAuxiliar(pendientes) {
  const porAuxiliar = {};
  pendientes.forEach(({ prestamo, cliente }) => {
    if (!prestamo.auxiliar || !prestamo.auxiliar.telefono) return;
    const keyAux = prestamo.auxiliar.telefono;
    if (!porAuxiliar[keyAux]) porAuxiliar[keyAux] = { auxiliar: prestamo.auxiliar, clientesMap: {} };
    if (!porAuxiliar[keyAux].clientesMap[cliente.id]) porAuxiliar[keyAux].clientesMap[cliente.id] = { cliente, prestamos: [] };
    porAuxiliar[keyAux].clientesMap[cliente.id].prestamos.push(prestamo);
  });
  return Object.values(porAuxiliar)
    .map((g) => ({ auxiliar: g.auxiliar, clientes: Object.values(g.clientesMap) }))
    .sort((a, b) => a.auxiliar.nombre.localeCompare(b.auxiliar.nombre));
}

// Arma el mensaje de WhatsApp con el resumen de todos los clientes (con deuda) que tiene
// a su cargo un prestador auxiliar: nombre del cliente, préstamo otorgado (fecha y monto)
// y el pago solicitado (monto y fecha límite) de cada préstamo pendiente.
function mensajeResumenAuxiliar(auxiliar, clientesConPrestamos) {
  const primerNombreAux = (auxiliar.nombre || "").split(" ")[0];
  const bloques = clientesConPrestamos.map(({ cliente, prestamos: lista }) => {
    const lineas = lista.map((p) =>
      `  · Préstamo otorgado: ${fmtDate(p.fechaOrigen)} (${fmtMoney(p.monto)}) — Pago solicitado: ${fmtMoney(p.cuota)}, vence ${fmtDate(p.proximoPago)}`
    ).join("\n");
    return `Cliente: ${cliente.nombre}\n${lineas}`;
  }).join("\n\n");
  const totalGeneral = clientesConPrestamos.reduce(
    (s, g) => s + g.prestamos.reduce((s2, p) => s2 + Number(p.cuota), 0), 0
  );
  return `Hola ${primerNombreAux}, te comparto el resumen de tus clientes con pagos pendientes a la fecha:

${bloques}

Total a cobrar entre todos: ${fmtMoney(totalGeneral)}

Por favor dales seguimiento para que paguen a tiempo. ¡Gracias!`;
}

/* ---------------- traslado de préstamos entre prestador principal y auxiliar ---------------- */

// Codifica un objeto como texto seguro para meter en un link (base64 url-safe, SIN "="
// de relleno). El resultado solo usa letras, números, "-" y "_", que ninguna app de
// mensajería (WhatsApp incluido) corta al detectar el link — a diferencia de "=", "#" o
// "?", que en algunas versiones sí lo cortan a la mitad.
function codificarPaquete(obj) {
  const json = JSON.stringify(obj);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodificarTexto(texto) {
  let b64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  return decodeURIComponent(escape(atob(b64)));
}

// Claves cortas para que el JSON (y por lo tanto el link) pese lo menos posible. Los
// nombres largos de los campos solo existen dentro de la app; aquí se traducen de ida y
// vuelta para no tocar el resto del código.
function comprimirCliente(c) {
  const o = { id: c.id, n: c.nombre, t: c.telefono };
  if (c.trabajo) o.tr = c.trabajo;
  if (c.domicilio) o.d = c.domicilio;
  return o;
}
function expandirCliente(c) {
  return { id: c.id, nombre: c.n || "", telefono: c.t || "", trabajo: c.tr || "", domicilio: c.d || "" };
}
function comprimirAuxiliar(a) {
  if (!a) return undefined;
  return { n: a.nombre, t: a.telefono, p: a.porcentaje };
}
function expandirAuxiliar(a) {
  if (!a) return null;
  return { nombre: a.n || "", telefono: a.t || "", porcentaje: a.p || 0 };
}
function comprimirHistorialEntry(h) {
  const o = { f: h.fecha, t: h.tipo, m: h.monto };
  if (h.interesMonto != null) o.im = h.interesMonto;
  if (h.capitalMonto != null) o.cm = h.capitalMonto;
  if (h.venciaEl) o.ve = h.venciaEl;
  if (h.auxiliarMonto) o.am = h.auxiliarMonto;
  if (h.esPrimerPagoAlCongelar) o.ep = 1;
  if (h.nota) o.no = h.nota;
  // comprobante (foto) intencionalmente nunca viaja por este medio
  return o;
}
function expandirHistorialEntry(h) {
  return {
    id: uid(), fecha: h.f, tipo: h.t, monto: h.m,
    interesMonto: h.im != null ? h.im : 0, capitalMonto: h.cm != null ? h.cm : 0,
    venciaEl: h.ve || h.f, auxiliarMonto: h.am || 0,
    ...(h.ep ? { esPrimerPagoAlCongelar: true } : {}),
    ...(h.no ? { nota: h.no } : {}),
    comprobante: null,
  };
}
function comprimirPrestamo(p) {
  const o = {
    id: p.id, cid: p.clienteId, m: p.monto, mo: p.montoOriginal, ti: p.tasaInteres,
    cu: p.cuota, fo: p.fechaOrigen, fr: p.frecuencia, pp: p.proximoPago,
    cp: p.capitalPendiente, h: (p.historial || []).map(comprimirHistorialEntry),
  };
  if (p.liquidado) o.li = 1;
  if (p.fechaLiquidado) o.fl = p.fechaLiquidado;
  if (p.abonoParcialActual) o.ap = p.abonoParcialActual;
  if (p.congelado) o.co = 1;
  if (p.congeladoDesde) o.cd = p.congeladoDesde;
  if (p.reestructuradoDesde) o.rd = p.reestructuradoDesde;
  if (p.auxiliar) o.ax = comprimirAuxiliar(p.auxiliar);
  if (p.auxiliarBonoPendiente) o.ab = p.auxiliarBonoPendiente;
  return o;
}
function expandirPrestamo(p) {
  return {
    id: p.id, clienteId: p.cid, monto: p.m, montoOriginal: p.mo != null ? p.mo : p.m,
    tasaInteres: p.ti, cuota: p.cu, fechaOrigen: p.fo, frecuencia: p.fr, proximoPago: p.pp,
    liquidado: !!p.li, fechaLiquidado: p.fl || null,
    capitalPendiente: p.cp != null ? p.cp : p.m, abonoParcialActual: p.ap || 0,
    congelado: !!p.co, congeladoDesde: p.cd || null, reestructuradoDesde: p.rd || null,
    auxiliar: expandirAuxiliar(p.ax), auxiliarBonoPendiente: p.ab || 0,
    historial: (p.h || []).map(expandirHistorialEntry),
  };
}

// Arma el paquete a compartir: el/los cliente(s) dueños de los préstamos seleccionados,
// los préstamos (sin comprobantes de pago, que son imágenes y harían el link enorme) y
// quién lo envía y con qué rol (para que del otro lado se muestre el rol contrario).
function empaquetarPrestamos(prestamosSeleccionados, clientes, remitente) {
  const clienteIds = new Set(prestamosSeleccionados.map((p) => p.clienteId));
  const clientesInvolucrados = clientes.filter((c) => clienteIds.has(c.id));
  return {
    v: 2,
    r: { n: remitente.nombre || "", t: remitente.telefono || "", o: remitente.rol === "auxiliar" ? "a" : "p" },
    c: clientesInvolucrados.map(comprimirCliente),
    p: prestamosSeleccionados.map(comprimirPrestamo),
  };
}

function decodificarPaquete(texto) {
  try {
    const obj = JSON.parse(decodificarTexto(texto));
    if (!obj) return null;
    if (obj.v === 2) {
      if (!Array.isArray(obj.p) || !Array.isArray(obj.c)) return null;
      return {
        remitente: { nombre: (obj.r && obj.r.n) || "", telefono: (obj.r && obj.r.t) || "", rol: obj.r && obj.r.o === "a" ? "auxiliar" : "principal" },
        clientes: obj.c.map(expandirCliente),
        prestamos: obj.p.map(expandirPrestamo),
      };
    }
    // Formato viejo (v1, sin comprimir) — por si queda algún link ya enviado antes de este cambio.
    if (obj.v === 1 && Array.isArray(obj.prestamos) && Array.isArray(obj.clientes)) return obj;
    return null;
  } catch (e) { return null; }
}

// Arma el link final usando la ruta (path), no query string ni fragmento: sin "?", "#"
// ni "=" en ningún lado, para que ninguna app de mensajería lo corte. Requiere que el
// hosting tenga un "catch-all" hacia index.html (ver public/_redirects).
function construirLinkCompartir(paquete) {
  const base = window.location.origin + window.location.pathname.replace(/\/$/, "");
  return `${base}/t/${codificarPaquete(paquete)}`;
}


function mensajeCompartirPaquete(paquete, link) {
  const nombreRemitente = (paquete.remitente.nombre || "").split(" ")[0] || "Hola";
  const rolTexto = paquete.remitente.rol === "principal" ? "prestador principal" : "prestador auxiliar";
  const n = paquete.prestamos.length;
  const plural = n === 1 ? "préstamo" : "préstamos";
  return `Hola, soy ${paquete.remitente.nombre || nombreRemitente} (${rolTexto}). Te comparto ${n} ${plural} para que los veas en tu app:\n\n${link}\n\nÁbrelo desde tu celular con la app instalada (o Chrome/Safari) y confirma la importación. Los comprobantes de pago no viajan por este medio.`;
}

/* ---------------- coincidencias al importar (evitar duplicar clientes/contactos) ---------------- */

// Normaliza texto para comparar nombres sin importar tildes, mayúsculas o espacios extra.
function normalizarTexto(s) {
  return (s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

// ¿Dos nombres probablemente son la misma persona? Tolera acentos, una palabra de más o
// de menos (apellidos compuestos, apodos) y orden distinto de nombre/apellido.
function nombresParecidos(a, b) {
  const na = normalizarTexto(a), nb = normalizarTexto(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;
  const wa = na.split(" ").filter((w) => w.length > 2);
  const wb = nb.split(" ").filter((w) => w.length > 2);
  if (wa.length === 0 || wb.length === 0) return false;
  const comunes = wa.filter((w) => wb.includes(w)).length;
  return comunes >= 2 || (comunes >= 1 && Math.min(wa.length, wb.length) === 1);
}

// Para un cliente que viene en un paquete recibido, busca posibles coincidencias entre
// los clientes que ya existen en la cartera local (por teléfono exacto o nombre parecido).
function candidatosCliente(clienteImportado, clientesLocales) {
  return clientesLocales
    .map((cliente) => ({
      cliente,
      mismoTelefono: !!clienteImportado.telefono && cliente.telefono === clienteImportado.telefono,
      parecido: nombresParecidos(cliente.nombre, clienteImportado.nombre),
    }))
    .filter((x) => x.mismoTelefono || x.parecido)
    .sort((a, b) => (b.mismoTelefono - a.mismoTelefono) || (b.parecido - a.parecido))
    .map((x) => x.cliente);
}

// Todos los prestadores (principales o auxiliares) con los que ya se ha tratado antes en
// esta cartera, para reconocerlos de nuevo aunque escriban su nombre distinto la próxima vez.
function contactosConocidos(prestamosLocales) {
  const map = new Map();
  prestamosLocales.forEach((p) => {
    if (p.auxiliar && p.auxiliar.telefono) map.set(p.auxiliar.telefono, { nombre: p.auxiliar.nombre, telefono: p.auxiliar.telefono });
    if (p.transferencia && p.transferencia.contraparte && p.transferencia.contraparte.telefono) {
      const c = p.transferencia.contraparte;
      map.set(c.telefono, { nombre: c.nombre, telefono: c.telefono });
    }
  });
  return Array.from(map.values());
}

// Combina un préstamo que ya tenías (local) con la versión que acaba de llegar
// (incoming) del mismo préstamo, en vez de duplicarlo: junta el historial de pagos de
// ambos lados (sin repetir) y toma como vigentes los datos del lado que tenga el pago
// más reciente, para que el saldo, la fecha de próximo pago y las comisiones del
// auxiliar se sigan reflejando correctamente para los dos.
function claveHistorial(h) {
  return [h.fecha, h.tipo, h.monto, h.capitalMonto || 0, h.interesMonto || 0].join("|");
}
function fusionarHistorial(a, b) {
  const vistos = new Set();
  const combinado = [];
  [...(a || []), ...(b || [])].forEach((h) => {
    const k = claveHistorial(h);
    if (vistos.has(k)) return;
    vistos.add(k);
    combinado.push(h);
  });
  combinado.sort((x, y) => (x.fecha || "").localeCompare(y.fecha || ""));
  return combinado;
}
function fusionarPrestamos(local, incoming) {
  const historial = fusionarHistorial(local.historial, incoming.historial);
  const ultimaLocal = (local.historial || []).reduce((m, h) => (h.fecha > m ? h.fecha : m), "");
  const ultimaIncoming = (incoming.historial || []).reduce((m, h) => (h.fecha > m ? h.fecha : m), "");
  const base = ultimaIncoming > ultimaLocal ? incoming : local;
  return {
    ...local,
    monto: base.monto, montoOriginal: base.montoOriginal != null ? base.montoOriginal : local.montoOriginal,
    tasaInteres: base.tasaInteres, cuota: base.cuota, frecuencia: base.frecuencia,
    proximoPago: base.proximoPago, liquidado: base.liquidado, fechaLiquidado: base.fechaLiquidado,
    capitalPendiente: base.capitalPendiente, abonoParcialActual: base.abonoParcialActual,
    congelado: base.congelado, congeladoDesde: base.congeladoDesde,
    reestructuradoDesde: base.reestructuradoDesde,
    // El % de comisión ya ajustado localmente no se pierde; solo se usa el del paquete
    // si aquí no había ninguno definido todavía.
    auxiliar: local.auxiliar || incoming.auxiliar || null,
    auxiliarBonoPendiente: Math.max(local.auxiliarBonoPendiente || 0, incoming.auxiliarBonoPendiente || 0),
    transferencia: incoming.transferencia || local.transferencia,
    historial,
  };
}



function fileToDataUrl(file, { maxWidth = 1400, quality = 0.72 } = {}) {
  return new Promise((resolve, reject) => {
    if (file.type && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > maxWidth) { height = Math.round((height * maxWidth) / width); width = maxWidth; }
          const canvas = document.createElement("canvas");
          canvas.width = width; canvas.height = height;
          canvas.getContext("2d").drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    }
  });
}

const DOC_CATS = [
  { key: "pagare", label: "Pagaré" },
  { key: "ine", label: "INE" },
  { key: "comprobante", label: "Comprobante de domicilio" },
];

/* ---------------- app ---------------- */

// De un nombre completo devuelve "primer nombre + primer apellido" para
// usarlo como título corto de la cartera. Ej: "José Antonio Miramontes
// Escobedo" -> "José Miramontes" (se asume 2 nombres + 2 apellidos cuando
// hay 4 palabras o más; con 3 palabras se asume 1 nombre + 2 apellidos).
function nombreCortoDueno(nombreCompleto) {
  const partes = (nombreCompleto || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  if (partes.length <= 2) return partes.join(" ");
  if (partes.length === 3) return `${partes[0]} ${partes[1]}`;
  return `${partes[0]} ${partes[2]}`;
}

export default function Cartera() {
  const [clientes, setClientes] = useState([]);
  const [prestamos, setPrestamos] = useState([]);
  const [auxiliares, setAuxiliares] = useState([]);
  const [duenoCartera, setDuenoCartera] = useState(""); // nombre completo del dueño de la cartera; se pide una sola vez
  const [loaded, setLoaded] = useState(false);
  const [vista, setVista] = useState("inicio");
  const [detalleId, setDetalleId] = useState(null);
  const [detalleOrigen, setDetalleOrigen] = useState("perfil");
  const [resaltarPagoId, setResaltarPagoId] = useState(null);
  const [clienteVistaId, setClienteVistaId] = useState(null);
  const [presetClienteId, setPresetClienteId] = useState(null);
  const [pagoModal, setPagoModal] = useState(null);
  const [paqueteImportar, setPaqueteImportar] = useState(null);
  const [importError, setImportError] = useState("");
  const [tecladoAbierto, setTecladoAbierto] = useState(false);
  const contenidoRef = useRef(null);

  // Oculta el menú inferior mientras el teclado está abierto y lo vuelve a
  // mostrar al cerrarlo, en vez de dejarlo fijo y generar un hueco vacío
  // entre el teclado y el menú.
  //
  // OJO: en este navegador comprobamos que window.innerHeight YA viene
  // recortado igual que visualViewport.height cuando el teclado está
  // abierto, así que compararlos entre sí nunca detecta nada. En su lugar,
  // guardamos la altura más grande que hemos visto (que corresponde a
  // cuando el teclado está cerrado) y comparamos la altura actual contra
  // ESA referencia — así si el teclado se come parte de la pantalla, sí lo
  // notamos.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return; // navegador muy antiguo sin soporte: dejamos el menú fijo, como antes.
    const UMBRAL_PX = 150; // margen de sobra para no confundir con la barra de direcciones
    let alturaMax = vv.height;
    const detectarTeclado = () => {
      if (vv.height > alturaMax) alturaMax = vv.height;
      const diferencia = alturaMax - vv.height;
      setTecladoAbierto(diferencia > UMBRAL_PX);
    };
    detectarTeclado();
    vv.addEventListener("resize", detectarTeclado);
    vv.addEventListener("scroll", detectarTeclado);
    return () => {
      vv.removeEventListener("resize", detectarTeclado);
      vv.removeEventListener("scroll", detectarTeclado);
    };
  }, []);

  // Cada vez que se entra a una pantalla distinta (incluyendo ver un cliente
  // o préstamo diferente dentro de la misma sección), la vista se posiciona
  // arriba del todo, sin enfocar ningún campo — el usuario decide cuándo
  // tocar un cuadro de texto para que aparezca el teclado.
  useEffect(() => {
    if (contenidoRef.current) contenidoRef.current.scrollTop = 0;
  }, [vista, detalleId, clienteVistaId]);

  // Guarda con reintentos silenciosos: el storage a veces falla de forma transitoria (red,
  // límite de peticiones) aunque el dato termine guardándose bien, así que no se muestra
  // ninguna leyenda de error al usuario — si de verdad fallara, la app no dejaría avanzar.
  const persistConReintento = useCallback(async (key, next) => {
    const intentos = 3;
    for (let i = 0; i < intentos; i++) {
      try {
        const res = await window.storage.set(key, JSON.stringify(next), false);
        if (res) return;
      } catch (e) { /* reintenta */ }
      if (i < intentos - 1) await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }, []);

  const persistClientes = useCallback((next) => persistConReintento("clientes", next), [persistConReintento]);
  const persistPrestamos = useCallback((next) => persistConReintento("prestamos", next), [persistConReintento]);
  const persistAuxiliares = useCallback((next) => persistConReintento("auxiliares", next), [persistConReintento]);

  useEffect(() => {
    (async () => {
      try {
        const rc = await window.storage.get("clientes", false).catch(() => null);
        const rp = await window.storage.get("prestamos", false).catch(() => null);
        const ra = await window.storage.get("auxiliares", false).catch(() => null);
        const rd = await window.storage.get("duenoCartera", false).catch(() => null);
        if (rc && rc.value) setClientes(JSON.parse(rc.value));
        if (rp && rp.value) setPrestamos(JSON.parse(rp.value));
        if (ra && ra.value) setAuxiliares(JSON.parse(ra.value));
        if (rd && rd.value) setDuenoCartera(rd.value);
      } catch (e) { /* sin datos aún */ }
      finally { setLoaded(true); }
    })();
  }, []);

  // Si la app se abrió desde un link de traslado, decodifica el paquete y lo deja listo
  // para mostrar una pantalla de confirmación antes de importar nada. El formato actual
  // va en la ruta (/t/XXXX, sin "?", "#" ni "="), porque algunas apps de mensajería
  // cortan el link clicable justo en esos símbolos. Se revisan también los formatos
  // viejos (?compartir=... y #compartir=...) por si queda algún link ya enviado antes.
  useEffect(() => {
    if (!loaded) return;
    let crudo = null;
    const marcaRuta = "/t/";
    const idxRuta = window.location.pathname.indexOf(marcaRuta);
    if (idxRuta !== -1) crudo = window.location.pathname.slice(idxRuta + marcaRuta.length).replace(/\/$/, "");
    if (!crudo) crudo = new URLSearchParams(window.location.search).get("compartir");
    if (!crudo) {
      const hash = window.location.hash || "";
      const marcaHash = "#compartir=";
      if (hash.startsWith(marcaHash)) crudo = hash.slice(marcaHash.length);
    }
    if (!crudo) return;
    const paquete = decodificarPaquete(crudo);
    if (paquete) { setPaqueteImportar(paquete); setVista("importar"); }
    else setImportError("Ese link de traslado no se pudo leer. Puede estar incompleto o dañado.");
    window.history.replaceState(null, "", window.location.origin + "/");
  }, [loaded]);

  // Combina un paquete recibido (de un prestador principal o auxiliar) con la cartera
  // local: los clientes se enlazan según lo que el usuario confirme en la pantalla de
  // importación (coincidencia sugerida por teléfono o nombre parecido, o "cliente
  // nuevo"), y los préstamos que ya se habían recibido antes (mismo origen) se
  // actualizan en vez de duplicarse, fusionando el historial de pagos de ambos lados
  // para que las comisiones del auxiliar y el saldo pendiente se sigan reflejando bien.
  // El rol que tenía el remitente se invierte para quien recibe: si te lo mandó el
  // prestador principal, tú quedas como auxiliar de ese préstamo, y viceversa.
  function importarPaquete(paquete, decisionesClientes = {}) {
    const remitente = paquete.remitente || {};
    const rolReceptor = remitente.rol === "auxiliar" ? "principal" : "auxiliar";

    // Si el remitente ya es un contacto conocido (mismo teléfono en algún préstamo
    // previo), se usa el nombre que ya tenías guardado para él, para no generar
    // variantes por acentos o letras de más/menos al volver a escribirlo.
    const conocido = contactosConocidos(prestamos).find((c) => c.telefono && c.telefono === remitente.telefono);
    const remitenteNombre = conocido ? conocido.nombre : (remitente.nombre || "");
    const contraparte = { nombre: remitenteNombre, telefono: remitente.telefono || "" };

    const nextClientes = [...clientes];
    const idMap = {};
    (paquete.clientes || []).forEach((c) => {
      const decision = decisionesClientes[c.id];
      if (decision && decision !== "nuevo") { idMap[c.id] = decision; return; }
      if (!decision) {
        const existente = nextClientes.find((lc) => lc.telefono && lc.telefono === c.telefono);
        if (existente) { idMap[c.id] = existente.id; return; }
      }
      const nuevo = { ...c, id: uid() };
      idMap[c.id] = nuevo.id;
      nextClientes.push(nuevo);
    });

    const nextPrestamos = [...prestamos];
    let agregados = 0, actualizados = 0;
    (paquete.prestamos || []).forEach((p) => {
      const clienteIdLocal = idMap[p.clienteId] || p.clienteId;
      const idxExistente = nextPrestamos.findIndex((lp) => lp.transferId === p.id || lp.id === p.id);
      if (idxExistente !== -1) {
        nextPrestamos[idxExistente] = fusionarPrestamos(nextPrestamos[idxExistente], {
          ...p,
          clienteId: clienteIdLocal,
          transferencia: { rol: rolReceptor, contraparte, recibidoEl: toISO(new Date()) },
        });
        actualizados++;
        return;
      }
      const nuevo = {
        ...p,
        id: uid(),
        transferId: p.id,
        clienteId: clienteIdLocal,
        transferencia: { rol: rolReceptor, contraparte, recibidoEl: toISO(new Date()) },
        ...(rolReceptor === "principal" && !p.auxiliar
          ? { auxiliar: { nombre: contraparte.nombre, telefono: contraparte.telefono, porcentaje: 0 } }
          : {}),
      };
      nextPrestamos.push(nuevo);
      agregados++;
    });

    setClientes(nextClientes);
    persistClientes(nextClientes);
    setPrestamos(nextPrestamos);
    persistPrestamos(nextPrestamos);
    setPaqueteImportar(null);
    setImportError("");
    setVista("clientes");
    return { agregados, actualizados };
  }

  function descartarImportacion() {
    setPaqueteImportar(null);
    setImportError("");
    setVista("clientes");
  }

  function eliminarPrestamosSeleccionados(prestamoIds) {
    const idsSet = new Set(prestamoIds);
    const next = prestamos.filter((p) => !idsSet.has(p.id));
    setPrestamos(next);
    persistPrestamos(next);
    prestamoIds.forEach((id) => { try { window.storage.delete("docs:" + id, false); } catch (e) { /* no había docs */ } });
  }

  function guardarNuevoPrestamo({ clienteId, clienteNuevo, prestamo, duenoNombre }) {
    if (duenoNombre && !duenoCartera) {
      setDuenoCartera(duenoNombre);
      window.storage.set("duenoCartera", duenoNombre, false).catch(() => {});
    }
    let cid = clienteId;
    if (clienteNuevo) {
      const nuevoCliente = { ...clienteNuevo, id: uid() };
      const nextClientes = [...clientes, nuevoCliente];
      setClientes(nextClientes);
      persistClientes(nextClientes);
      cid = nuevoCliente.id;
    }
    if (prestamo.auxiliar) {
      const existe = auxiliares.find((a) => a.telefono === prestamo.auxiliar.telefono);
      if (!existe) {
        const nextAux = [...auxiliares, { id: uid(), nombre: prestamo.auxiliar.nombre, telefono: prestamo.auxiliar.telefono }];
        setAuxiliares(nextAux);
        persistAuxiliares(nextAux);
      }
    }
    const nuevoPrestamo = { ...prestamo, id: uid(), clienteId: cid, historial: [] };
    const nextPrestamos = [...prestamos, nuevoPrestamo];
    setPrestamos(nextPrestamos);
    persistPrestamos(nextPrestamos);
    setPresetClienteId(null);
    setClienteVistaId(cid);
    setVista("perfil");
  }

  function editarCliente(clienteId, datos) {
    const next = clientes.map((c) => c.id === clienteId ? { ...c, ...datos } : c);
    setClientes(next);
    persistClientes(next);
    setVista("perfil");
  }

  function abrirPagoIndividual(prestamo) { setPagoModal({ modo: "individual", prestamos: [prestamo] }); }
  function abrirPagoGrupo(lista) { setPagoModal({ modo: "grupo", prestamos: lista }); }

  function confirmarPago({ modo, prestamos: lista, tipo, monto, comprobante, fecha }) {
    const fechaPago = fecha || toISO(new Date());
    // El monto de "Pago completo" y "Liquidación total" se calcula con la fecha real de
    // HOY (el momento en que se procesa el pago), no con `fechaPago` (la fecha que el
    // usuario elige para el registro, que puede ser "Ayer" u otra fecha pasada). Si se
    // usara `fechaPago` y el préstamo recién cruzó un mes de interés (o una cuota, si está
    // congelado), elegir una fecha anterior a ese cruce podía calcular el monto pendiente
    // como $0 aunque en pantalla se hubiera mostrado un monto mayor. `fechaPago` se sigue
    // usando solo para el registro histórico (con qué fecha queda archivado el pago), no
    // para el cálculo.
    const hoyISOPago = toISO(new Date());
    const idsSet = new Set(lista.map((p) => p.id));
    const next = prestamos.map((p) => {
      if (!idsSet.has(p.id)) return p;
      const historialId = uid();
      if (modo === "grupo") {
        if (tipo === "liquidado") {
          const capitalPendienteP = p.capitalPendiente == null ? p.monto : p.capitalPendiente;
          const interesMontoP = interesPendienteDe(p, hoyISOPago);
          const montoLiqP = capitalPendienteP + interesMontoP;
          const auxiliarMontoLiqP = calcularAuxiliarMonto(p, montoLiqP, interesMontoP, "liquidado").auxiliarMonto;
          return {
            ...p,
            liquidado: true,
            fechaLiquidado: fechaPago,
            capitalPendiente: 0,
            abonoParcialActual: 0,
            auxiliarBonoPendiente: 0,
            historial: [...p.historial, { id: historialId, fecha: fechaPago, tipo: "liquidado", monto: montoLiqP, interesMonto: interesMontoP, capitalMonto: capitalPendienteP, venciaEl: p.proximoPago, auxiliarMonto: auxiliarMontoLiqP, comprobante: comprobante || null }],
          };
        }
        const montoAPagarP = montoPagoCompleto(p, hoyISOPago);
        const { auxiliarMonto, bonoRestante } = calcularAuxiliarMonto(p, montoAPagarP, montoAPagarP, "completo");
        const nuevaFecha = avanzarProximoPago(p, hoyISOPago);
        const { interesAplicado, capitalAplicado, nuevoCapitalPendiente } = p.congelado ? splitPagoCongelado(p, montoAPagarP) : splitPago(p, montoAPagarP, hoyISOPago);
        // Si este pago deja saldado por completo un préstamo congelado (capital pendiente
        // en cero), se liquida automáticamente: cambia a estatus "liquidado" y sale de
        // préstamos activos, sin esperar una acción explícita de "Liquidar".
        const seLiquidaAutoP = p.congelado && nuevoCapitalPendiente <= 0;
        return {
          ...p,
          proximoPago: nuevaFecha,
          abonoParcialActual: 0,
          capitalPendiente: nuevoCapitalPendiente,
          auxiliarBonoPendiente: bonoRestante,
          ...(seLiquidaAutoP ? { liquidado: true, fechaLiquidado: fechaPago } : {}),
          historial: [...p.historial, { id: historialId, fecha: fechaPago, tipo: "completo", monto: montoAPagarP, interesMonto: interesAplicado, capitalMonto: capitalAplicado, venciaEl: p.proximoPago, auxiliarMonto, comprobante: comprobante || null }],
        };
      }
      if (tipo === "parcial") {
        const montoNum = Number(monto);
        const { auxiliarMonto: auxiliarMontoParcial, bonoRestante: bonoRestanteParcial } = calcularAuxiliarMonto(p, montoNum, montoNum, "parcial");
        const { interesAplicado, capitalAplicado, nuevoCapitalPendiente } = p.congelado ? splitPagoCongelado(p, montoNum) : splitPago(p, montoNum, fechaPago);
        const seLiquidaAutoParcial = p.congelado && nuevoCapitalPendiente <= 0;
        return {
          ...p,
          capitalPendiente: nuevoCapitalPendiente,
          abonoParcialActual: (p.abonoParcialActual || 0) + montoNum,
          auxiliarBonoPendiente: bonoRestanteParcial,
          ...(seLiquidaAutoParcial ? { liquidado: true, fechaLiquidado: fechaPago } : {}),
          historial: [...p.historial, { id: historialId, fecha: fechaPago, tipo: "parcial", monto: montoNum, interesMonto: interesAplicado, capitalMonto: capitalAplicado, venciaEl: p.proximoPago, auxiliarMonto: auxiliarMontoParcial, comprobante: comprobante || null }],
        };
      }
      if (tipo === "completo") {
        const montoAPagar = montoPagoCompleto(p, hoyISOPago);
        const { auxiliarMonto, bonoRestante } = calcularAuxiliarMonto(p, montoAPagar, montoAPagar, "completo");
        const nuevaFecha = avanzarProximoPago(p, hoyISOPago);
        const { interesAplicado, capitalAplicado, nuevoCapitalPendiente } = p.congelado ? splitPagoCongelado(p, montoAPagar) : splitPago(p, montoAPagar, hoyISOPago);
        const seLiquidaAuto = p.congelado && nuevoCapitalPendiente <= 0;
        return {
          ...p,
          proximoPago: nuevaFecha,
          abonoParcialActual: 0,
          capitalPendiente: nuevoCapitalPendiente,
          auxiliarBonoPendiente: bonoRestante,
          ...(seLiquidaAuto ? { liquidado: true, fechaLiquidado: fechaPago } : {}),
          historial: [...p.historial, { id: historialId, fecha: fechaPago, tipo: "completo", monto: montoAPagar, interesMonto: interesAplicado, capitalMonto: capitalAplicado, venciaEl: p.proximoPago, auxiliarMonto, comprobante: comprobante || null }],
        };
      }
      if (tipo === "liquidado") {
        const capitalPendienteAntes = p.capitalPendiente == null ? p.monto : p.capitalPendiente;
        const interesMontoLiq = interesPendienteDe(p, hoyISOPago);
        const auxiliarMontoLiq = calcularAuxiliarMonto(p, Number(monto), interesMontoLiq, "liquidado").auxiliarMonto;
        return {
          ...p,
          liquidado: true,
          fechaLiquidado: fechaPago,
          capitalPendiente: 0,
          abonoParcialActual: 0,
          auxiliarBonoPendiente: 0,
          historial: [...p.historial, { id: historialId, fecha: fechaPago, tipo: "liquidado", monto: Number(monto), interesMonto: interesMontoLiq, capitalMonto: capitalPendienteAntes, venciaEl: p.proximoPago, auxiliarMonto: auxiliarMontoLiq, comprobante: comprobante || null }],
        };
      }
      return p;
    });
    setPrestamos(next);
    persistPrestamos(next);
    setPagoModal(null);
  }

  // pagoExtra: opcional { monto, interesMonto, capitalMonto } — usado cuando la
  // reestructuración incluye un primer pago inmediato, que se registra en el historial
  // como un pago y se resta de la nueva deuda antes de guardar los cambios.
  function reestructurarPrestamo(prestamoId, updates, nota, pagoExtra) {
    const next = prestamos.map((p) => {
      if (p.id !== prestamoId) return p;
      const historialNuevo = [];
      if (pagoExtra && Number(pagoExtra.monto) > 0) {
        historialNuevo.push({
          id: uid(), fecha: toISO(new Date()), tipo: "parcial", monto: Number(pagoExtra.monto),
          interesMonto: Number(pagoExtra.interesMonto || 0), capitalMonto: Number(pagoExtra.capitalMonto || 0),
          venciaEl: p.proximoPago, auxiliarMonto: Number(pagoExtra.auxiliarMonto || 0), comprobante: null,
          // Este primer pago (dado justo al congelar) ya se descontó de la nueva deuda;
          // es independiente de las cuotas por fecha, así que no debe restarse otra vez
          // de lo exigible en pagosCapitalHistorialCongelado.
          esPrimerPagoAlCongelar: true,
        });
      }
      historialNuevo.push({ id: uid(), fecha: toISO(new Date()), tipo: "reestructuracion", monto: 0, interesMonto: 0, capitalMonto: 0, nota: nota || "" });
      return { ...p, ...updates, historial: [...p.historial, ...historialNuevo] };
    });
    setPrestamos(next);
    persistPrestamos(next);
  }

  function eliminarPrestamo(prestamoId) {
    const prestamo = prestamos.find((p) => p.id === prestamoId);
    const next = prestamos.filter((p) => p.id !== prestamoId);
    setPrestamos(next);
    persistPrestamos(next);
    try { window.storage.delete("docs:" + prestamoId, false); } catch (e) { /* no había docs */ }
    if (prestamo) { setClienteVistaId(prestamo.clienteId); setVista("perfil"); }
    else setVista("clientes");
  }

  function eliminarCliente(clienteId) {
    const prestamosDelCliente = prestamos.filter((p) => p.clienteId === clienteId);
    const nextClientes = clientes.filter((c) => c.id !== clienteId);
    const nextPrestamos = prestamos.filter((p) => p.clienteId !== clienteId);
    setClientes(nextClientes);
    setPrestamos(nextPrestamos);
    persistClientes(nextClientes);
    persistPrestamos(nextPrestamos);
    prestamosDelCliente.forEach((p) => { try { window.storage.delete("docs:" + p.id, false); } catch (e) { /* no había docs */ } });
    setVista("clientes");
  }

  const hoyISO = toISO(new Date());
  const pendientes = prestamos
    .filter((p) => !p.liquidado && !["aldia", "sinIntereses"].includes(estadoDe(p, hoyISO)))
    .map((p) => ({ prestamo: p, cliente: clientes.find((c) => c.id === p.clienteId) }))
    .filter((x) => !!x.cliente)
    .sort((a, b) => diasHasta(a.prestamo.proximoPago) - diasHasta(b.prestamo.proximoPago));

  const totalActivo = prestamos.filter((p) => !p.liquidado).reduce((s, p) => s + calcularAdeudoActualizado(p, hoyISO), 0);
  const prestamosActivos = prestamos.filter((p) => !p.liquidado).length;

  const prestamoDetalle = detalleId ? prestamos.find((p) => p.id === detalleId) : null;
  const clienteDetalle = prestamoDetalle ? clientes.find((c) => c.id === prestamoDetalle.clienteId) : null;
  const clientePerfil = clienteVistaId ? clientes.find((c) => c.id === clienteVistaId) : null;
  const prestamosDelPerfil = clientePerfil ? prestamos.filter((p) => p.clienteId === clientePerfil.id) : [];

  if (!loaded) {
    return <Shell><div style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>Cargando tu cartera…</div></Shell>;
  }

  return (
    <Shell>
      <TopBar total={totalActivo} count={prestamosActivos} duenoCartera={duenoCartera} />
      <div ref={contenidoRef} style={{ flex: 1, overflowY: "auto", paddingBottom: tecladoAbierto ? 0 : 116, transition: "padding-bottom 200ms ease" }}>
        {vista === "inicio" && (
          <Inicio
            pendientes={pendientes}
            totalPrestamos={prestamos.length}
            onPagarIndividual={abrirPagoIndividual}
            onPagarGrupo={abrirPagoGrupo}
            onVerPrestamo={(id) => { setDetalleId(id); setDetalleOrigen("perfil"); setResaltarPagoId(null); setVista("detalle"); }}
            onNuevo={() => { setPresetClienteId(null); setVista("nuevo"); }}
          />
        )}
        {vista === "clientes" && (
          <ListaClientes
            clientes={clientes}
            prestamos={prestamos}
            onVerCliente={(id) => { setClienteVistaId(id); setVista("perfil"); }}
          />
        )}
        {vista === "perfil" && clientePerfil && (
          <ClientePerfil
            cliente={clientePerfil}
            prestamos={prestamosDelPerfil}
            onVolver={() => setVista("clientes")}
            onVerPrestamo={(id) => { setDetalleId(id); setDetalleOrigen("perfil"); setResaltarPagoId(null); setVista("detalle"); }}
            onNuevoPrestamo={() => { setPresetClienteId(clientePerfil.id); setVista("nuevo"); }}
            onEditar={() => setVista("editarCliente")}
            onEliminarCliente={() => eliminarCliente(clientePerfil.id)}
            onEliminarPrestamos={eliminarPrestamosSeleccionados}
          />
        )}
        {vista === "importar" && (
          <ImportarPaquete
            paquete={paqueteImportar}
            error={importError}
            clientesLocales={clientes}
            prestamosLocales={prestamos}
            onImportar={importarPaquete}
            onDescartar={descartarImportacion}
          />
        )}
        {vista === "editarCliente" && clientePerfil && (
          <EditarCliente
            cliente={clientePerfil}
            onGuardar={(datos) => editarCliente(clientePerfil.id, datos)}
            onCancelar={() => setVista("perfil")}
          />
        )}
        {vista === "nuevo" && (
          <NuevoPrestamo
            clientes={clientes}
            auxiliares={auxiliares}
            presetClienteId={presetClienteId}
            duenoCartera={duenoCartera}
            onGuardar={guardarNuevoPrestamo}
            onCancelar={() => setVista(presetClienteId ? "perfil" : "clientes")}
          />
        )}
        {vista === "detalle" && prestamoDetalle && clienteDetalle && (
          <Detalle
            prestamo={prestamoDetalle}
            cliente={clienteDetalle}
            onVolver={() => { if (detalleOrigen === "libro") { setVista("libro"); } else { setClienteVistaId(prestamoDetalle.clienteId); setVista("perfil"); } }}
            onPagar={() => abrirPagoIndividual(prestamoDetalle)}
            onEliminar={() => eliminarPrestamo(prestamoDetalle.id)}
            onReestructurar={reestructurarPrestamo}
            resaltarHistorialId={resaltarPagoId}
          />
        )}
        {vista === "libro" && (
          <Libro
            prestamos={prestamos}
            clientes={clientes}
            onVerPrestamo={(id, historialId) => { setDetalleId(id); setDetalleOrigen("libro"); setResaltarPagoId(historialId || null); setVista("detalle"); }}
          />
        )}
      </div>
      <BottomNav vista={vista} setVista={(v) => { setPresetClienteId(null); setDetalleOrigen("perfil"); setResaltarPagoId(null); setVista(v); }} pendientesCount={pendientes.length} oculto={tecladoAbierto} />
      {pagoModal && (
        <PagoModal pago={pagoModal} onCancelar={() => setPagoModal(null)} onConfirmar={confirmarPago} />
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div className="cartera-shell" style={{
      "--bg": "#10161D", "--surface": "#1A222B", "--surface2": "#212B36", "--border": "#2A343F",
      "--gold": "#E3A23C", "--green": "#6FA284", "--red": "#DD5C4E", "--text": "#F2EEE4", "--muted": "#8B98A5",
      "--font-display": "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
      "--font-body": "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      "--font-mono": "'SF Mono', 'Roboto Mono', ui-monospace, monospace",
      background: "var(--bg)", color: "var(--text)", width: "100%", maxWidth: 480, margin: "0 auto",
      minHeight: 640, display: "flex", flexDirection: "column", fontFamily: "var(--font-body)",
      position: "relative", overflow: "hidden",
    }}>{children}</div>
  );
}

function TopBar({ total, count, duenoCartera }) {
  const titulo = duenoCartera ? `Cartera ${nombreCortoDueno(duenoCartera)}` : "Cartera";
  return (
    <div style={{ padding: "20px 20px 18px", paddingTop: "calc(env(safe-area-inset-top, 0px) + 20px)", borderBottom: "1px solid var(--border)", background: "linear-gradient(180deg, var(--surface) 0%, var(--bg) 100%)" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 700 }}>{titulo}</div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Adeudo activo</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtMoney(total)}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Préstamos activos</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 700 }}>{count}</div>
        </div>
      </div>
    </div>
  );
}

function Inicio({ pendientes, totalPrestamos, onPagarIndividual, onPagarGrupo, onVerPrestamo, onNuevo }) {
  const [vistaInicio, setVistaInicio] = useState("clientes");
  const hoyISO = toISO(new Date());

  if (totalPrestamos === 0) {
    return (
      <div style={{ padding: "60px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📒</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 19, marginBottom: 8 }}>Aún no tienes préstamos</div>
        <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 22, lineHeight: 1.5 }}>
          Registra tu primer préstamo para empezar a llevar el control de pagos y recordatorios.
        </div>
        <button onClick={onNuevo} style={btnPrimary}><Plus size={16} /> Nuevo préstamo</button>
      </div>
    );
  }

  const gruposMap = {};
  pendientes.forEach(({ prestamo, cliente }) => {
    if (!gruposMap[cliente.id]) gruposMap[cliente.id] = { cliente, prestamos: [] };
    gruposMap[cliente.id].prestamos.push(prestamo);
  });
  const grupos = Object.values(gruposMap).sort((a, b) => Math.min(...a.prestamos.map((p) => diasHasta(p.proximoPago))) - Math.min(...b.prestamos.map((p) => diasHasta(p.proximoPago))));

  const gruposAuxiliares = agruparPendientesPorAuxiliar(pendientes);

  return (
    <div style={{ padding: "16px 16px 0" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setVistaInicio("clientes")} style={{ ...pillBtn, flex: 1, background: vistaInicio === "clientes" ? "var(--gold)" : "var(--surface2)", color: vistaInicio === "clientes" ? "#1A130A" : "var(--text)", borderColor: vistaInicio === "clientes" ? "var(--gold)" : "var(--border)" }}>Por cliente</button>
        <button type="button" onClick={() => setVistaInicio("auxiliares")} style={{ ...pillBtn, flex: 1, background: vistaInicio === "auxiliares" ? "var(--gold)" : "var(--surface2)", color: vistaInicio === "auxiliares" ? "#1A130A" : "var(--text)", borderColor: vistaInicio === "auxiliares" ? "var(--gold)" : "var(--border)" }}>Por prestador auxiliar</button>
      </div>

      {vistaInicio === "clientes" && (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <AlertCircle size={13} /> Necesitan recordatorio ({grupos.length})
          </div>
          {grupos.length === 0 && <div style={{ padding: "20px 4px", color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>Nadie tiene pagos próximos o vencidos hoy. Todo al día.</div>}
          {grupos.map(({ cliente, prestamos: lista }) => {
            const total = lista.reduce((s, p) => s + montoPagoCompleto(p, hoyISO), 0);
            const peorEstado = lista.reduce((peor, p) => {
              const e = estadoDe(p, hoyISO);
              return RANGO_ESTADO[e] > RANGO_ESTADO[peor] ? e : peor;
            }, "sinIntereses");
            const auxUnicos = auxiliaresUnicosDeLista(lista);
            const { congelado: algunoCongeladoG } = peorEstadoDeLista(lista, hoyISO);
            return (
              <div key={cliente.id} style={{ ...cardStyle, ...estadoGlowStyle(peorEstado, algunoCongeladoG) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{cliente.nombre}</div>
                    {lista.map((p) => {
                      const pagoActualizado = montoPagoCompleto(p, hoyISO);
                      const atrasadoP = pagoActualizado > Number(p.cuota || 0);
                      return (
                        <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginTop: 4 }}>
                          <span onClick={() => onVerPrestamo(p.id)} style={{ fontSize: 13, color: atrasadoP ? "var(--red)" : "var(--muted)", fontWeight: atrasadoP ? 600 : 400, cursor: "pointer" }}>{fmtMoney(pagoActualizado)} · vence {fmtDate(p.proximoPago)}</span>
                          {lista.length > 1 && <button type="button" onClick={() => onPagarIndividual(p)} style={{ ...pillBtn, padding: "3px 8px", fontSize: 11 }}>Pagar</button>}
                        </div>
                      );
                    })}
                    {lista.length > 1 && <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)", marginTop: 6 }}>Total combinado: {fmtMoney(total)}</div>}
                  </div>
                  <Stamp estado={peorEstado} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <a href={waLink(cliente.telefono, mensajeRecordatorioGrupo(cliente, lista))} target="_blank" rel="noopener noreferrer" style={btnWhatsapp}><MessageCircle size={15} /> Cliente</a>
                  {auxUnicos.map((aux) => (
                    <a key={aux.telefono} href={waLink(aux.telefono, mensajeRecordatorioAuxiliarGrupo(cliente, lista.filter((p) => p.auxiliar && p.auxiliar.telefono === aux.telefono)))} target="_blank" rel="noopener noreferrer" style={{ ...btnWhatsapp, background: "var(--gold)", color: "#1A130A" }}><UserCog size={15} /> {aux.nombre}</a>
                  ))}
                  <button type="button" onClick={() => lista.length > 1 ? onPagarGrupo(lista) : onPagarIndividual(lista[0])} style={btnGhost}>{lista.length > 1 ? "Pagar todos" : "Marcar pagado"}</button>
                </div>
              </div>
            );
          })}
        </>
      )}

      {vistaInicio === "auxiliares" && (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
            <UserCog size={13} /> Prestadores auxiliares con pendientes ({gruposAuxiliares.length})
          </div>
          {gruposAuxiliares.length === 0 && (
            <div style={{ padding: "20px 4px", color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>
              Ningún prestador auxiliar tiene clientes con pagos pendientes hoy.
            </div>
          )}
          {gruposAuxiliares.map(({ auxiliar, clientes: clientesAux }) => {
            // El total a cobrar se calcula con el adeudo actualizado a hoy de cada préstamo
            // (capital pendiente + interés generado hasta la fecha), no con la cuota nominal,
            // para que refleje meses atrasados y pagos no realizados.
            const totalAux = clientesAux.reduce((s, g) => s + g.prestamos.reduce((s2, p) => s2 + calcularAdeudoActualizado(p, hoyISO), 0), 0);
            const numPrestamosAux = clientesAux.reduce((s, g) => s + g.prestamos.length, 0);
            const { estado: peorEstadoAux, congelado: algunoCongeladoAux } = peorEstadoDeLista(clientesAux.flatMap((g) => g.prestamos), hoyISO);
            return (
              <div key={auxiliar.telefono} style={{ ...cardStyle, ...estadoGlowStyle(peorEstadoAux, algunoCongeladoAux) }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{auxiliar.nombre}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{clientesAux.length} cliente(s) · {numPrestamosAux} préstamo(s)</div>
                </div>
                {clientesAux.map(({ cliente, prestamos: lista }) => (
                  <div key={cliente.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{cliente.nombre}</div>
                    {lista.map((p) => {
                      const adeudoP = calcularAdeudoActualizado(p, hoyISO);
                      const atrasado = adeudoP > Number(p.cuota || 0);
                      return (
                        <div key={p.id} onClick={() => onVerPrestamo(p.id)} style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, cursor: "pointer" }}>
                          Prestado {fmtMoney(p.monto)} el {fmtDate(p.fechaOrigen)} · cuota {fmtMoney(p.cuota)}, vence {fmtDate(p.proximoPago)}
                          {atrasado && <span style={{ color: "var(--red)", fontWeight: 600 }}> · adeudo actualizado a hoy: {fmtMoney(adeudoP)}</span>}
                        </div>
                      );
                    })}
                  </div>
                ))}
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)", marginTop: 8 }}>Total a cobrar hoy: {fmtMoney(totalAux)}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <a
                    href={waLink(auxiliar.telefono, mensajeResumenAuxiliar(auxiliar, clientesAux))}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...btnWhatsapp, background: "var(--gold)", color: "#1A130A" }}
                  >
                    <MessageCircle size={15} /> Enviar resumen a {auxiliar.nombre.split(" ")[0]}
                  </a>
                </div>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function ListaClientes({ clientes, prestamos, onVerCliente }) {
  const hoyISO = toISO(new Date());
  const conInfo = clientes.map((c) => {
    const propios = prestamos.filter((p) => p.clienteId === c.id);
    const activos = propios.filter((p) => !p.liquidado);
    const adeudo = activos.reduce((s, p) => s + calcularAdeudoActualizado(p, hoyISO), 0);
    let estado = null;
    let congelado = false;
    if (activos.length > 0) {
      const peor = peorEstadoDeLista(activos, hoyISO);
      estado = peor.estado;
      congelado = peor.congelado;
    }
    return { cliente: c, numPrestamos: propios.length, numActivos: activos.length, adeudo, estado, congelado };
  }).sort((a, b) => (RANGO_ESTADO[b.estado] ?? -1) - (RANGO_ESTADO[a.estado] ?? -1) || a.cliente.nombre.localeCompare(b.cliente.nombre));

  return (
    <div style={{ padding: "16px 16px 0" }}>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Todos los clientes ({clientes.length})</div>
      {conInfo.length === 0 && <div style={{ padding: "20px 4px", color: "var(--muted)", fontSize: 14 }}>No hay clientes todavía.</div>}
      {conInfo.map(({ cliente, numPrestamos, numActivos, adeudo, estado, congelado }) => (
        <div key={cliente.id} style={{ ...cardStyle, cursor: "pointer", ...(estado ? estadoGlowStyle(estado, congelado) : {}) }} onClick={() => onVerCliente(cliente.id)}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{cliente.nombre}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{numPrestamos} préstamo(s) · {numActivos} activo(s)</div>
              {adeudo > 0 && <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 1 }}>Adeudo activo: {fmtMoney(adeudo)}</div>}
            </div>
            {estado && <Stamp estado={estado} />}
          </div>
        </div>
      ))}
    </div>
  );
}

// Insignia que indica que este préstamo llegó por traslado (link de WhatsApp) desde otro
// teléfono, y qué rol te toca a ti en él.
function TransferenciaBadge({ transferencia }) {
  if (!transferencia) return null;
  const texto = transferencia.rol === "auxiliar"
    ? `Eres el prestador auxiliar · principal: ${(transferencia.contraparte.nombre || "").split(" ")[0]}`
    : `Eres el prestador principal · recibido de: ${(transferencia.contraparte.nombre || "").split(" ")[0]}`;
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 600, color: "var(--gold)", background: "rgba(227,162,60,0.12)", border: "1px solid var(--gold)", borderRadius: 6, padding: "3px 7px", marginTop: 6 }}>
      <UserCog size={12} /> {texto}
    </div>
  );
}

function ClientePerfil({ cliente, prestamos, onVolver, onVerPrestamo, onNuevoPrestamo, onEditar, onEliminarCliente, onEliminarPrestamos }) {
  const [confirmando, setConfirmando] = useState(false);
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionados, setSeleccionados] = useState([]);
  const [confirmandoBorrarSel, setConfirmandoBorrarSel] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);
  const hoyISO = toISO(new Date());

  function alternarSeleccion(id) {
    setSeleccionados((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }
  function salirDeSeleccion() {
    setModoSeleccion(false);
    setSeleccionados([]);
    setConfirmandoBorrarSel(false);
  }
  function confirmarBorradoSeleccion() {
    onEliminarPrestamos(seleccionados);
    salirDeSeleccion();
  }
  // Los préstamos atrasados/vencidos se muestran primero, para que salten a la vista de
  // inmediato; dentro de un mismo estado, el más reciente primero.
  const propios = [...prestamos].sort((a, b) => {
    const rango = (RANGO_ESTADO[estadoDe(b, hoyISO)] ?? 0) - (RANGO_ESTADO[estadoDe(a, hoyISO)] ?? 0);
    if (rango !== 0) return rango;
    return b.fechaOrigen.localeCompare(a.fechaOrigen);
  });

  return (
    <div style={{ padding: "16px 16px 24px" }}>
      <button onClick={onVolver} style={{ ...btnGhost, marginBottom: 14, padding: "6px 10px" }}><ChevronLeft size={16} /> Clientes</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{cliente.nombre}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}><Phone size={13} /> {cliente.telefono}</div>
          {cliente.trabajo && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}><Briefcase size={13} /> {cliente.trabajo}</div>}
          {cliente.domicilio && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={13} /> {cliente.domicilio}</div>}
        </div>
        <button onClick={onEditar} style={{ ...btnGhost, padding: "6px 10px" }}><Pencil size={14} /></button>
      </div>

      <button onClick={onNuevoPrestamo} style={{ ...btnPrimary, marginTop: 16 }}><Plus size={16} /> Nuevo préstamo para este cliente</button>

      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Préstamos ({propios.length})</div>
          {propios.length > 0 && !modoSeleccion && (
            <button onClick={() => setModoSeleccion(true)} style={{ ...btnGhost, padding: "5px 9px", fontSize: 12 }}>Seleccionar</button>
          )}
          {modoSeleccion && (
            <button onClick={salirDeSeleccion} style={{ ...btnGhost, padding: "5px 9px", fontSize: 12 }}><X size={13} /> Cancelar</button>
          )}
        </div>
        {propios.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>Sin préstamos todavía.</div>}
        {propios.map((p) => {
          const resumenP = p.liquidado ? resumenFinancieroPrestamo(p, hoyISO) : null;
          const marcado = seleccionados.includes(p.id);
          return (
            <div
              key={p.id}
              style={{ ...cardStyle, cursor: "pointer", display: "flex", gap: 10, alignItems: "flex-start", ...(modoSeleccion && marcado ? { border: "1.5px solid var(--gold)" } : prestamoGlowStyle(p, hoyISO)) }}
              onClick={() => modoSeleccion ? alternarSeleccion(p.id) : onVerPrestamo(p.id)}
            >
              {modoSeleccion && (
                <input type="checkbox" checked={marcado} onChange={() => alternarSeleccion(p.id)} onClick={(e) => e.stopPropagation()} style={{ width: 18, height: 18, marginTop: 2, flexShrink: 0 }} />
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flex: 1 }}>
                <div>
                  <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Préstamo</div>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{fmtMoney(p.monto)}</div>
                  <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 1 }}>Otorgado el {fmtDate(p.fechaOrigen)}</div>
                  {!p.liquidado && (
                    <>
                      <div style={{ fontSize: 13, color: "var(--gold)", marginTop: 2 }}>Adeudo actualizado: {fmtMoney(calcularAdeudoActualizado(p, hoyISO))}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{descripcionFrecuencia(p.frecuencia)}</div>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 1 }}>Próximo pago: {fmtDate(p.proximoPago)}</div>
                    </>
                  )}
                  {p.liquidado && (
                    <>
                      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 1 }}>Liquidado el {fmtDate(p.fechaLiquidado || p.proximoPago)}</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--gold)", marginTop: 4 }}>{resumenP.pctRecuperado}% recuperado</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: resumenP.gananciaDespuesComisiones < 0 ? "var(--red)" : "var(--green)" }}>Ganancia después de comisiones: {fmtMoney(resumenP.gananciaDespuesComisiones)}</div>
                    </>
                  )}
                  <TransferenciaBadge transferencia={p.transferencia} />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                  {p.congelado && !p.liquidado && <CongeladoBadge />}
                  <Stamp estado={estadoDe(p, hoyISO)} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modoSeleccion && seleccionados.length > 0 && (
        <div style={{ position: "sticky", bottom: 0, background: "var(--bg)", paddingTop: 10, paddingBottom: 4 }}>
          {!confirmandoBorrarSel ? (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmandoBorrarSel(true)} style={{ ...btnGhostFull, color: "var(--red)", borderColor: "var(--red)" }}><Trash2 size={15} /> Eliminar ({seleccionados.length})</button>
              <button onClick={() => setCompartiendo(true)} style={{ ...btnWhatsapp, flex: 1 }}><MessageCircle size={15} /> Enviar ({seleccionados.length})</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmandoBorrarSel(false)} style={btnGhostFull}><X size={15} /> Cancelar</button>
              <button onClick={confirmarBorradoSeleccion} style={{ ...btnGhostFull, flex: 1, background: "var(--red)", color: "#1A0E0C", borderColor: "var(--red)" }}>Sí, eliminar {seleccionados.length}</button>
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 30 }}>
        {!confirmando ? (
          <button onClick={() => setConfirmando(true)} style={{ ...btnGhostFull, color: "var(--red)", borderColor: "var(--red)" }}><Trash2 size={15} /> Eliminar cliente y sus préstamos</button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirmando(false)} style={btnGhostFull}><X size={15} /> Cancelar</button>
            <button onClick={onEliminarCliente} style={{ ...btnGhostFull, flex: 1, background: "var(--red)", color: "#1A0E0C", borderColor: "var(--red)" }}>Sí, eliminar</button>
          </div>
        )}
      </div>

      {compartiendo && (
        <CompartirModal
          cliente={cliente}
          prestamos={propios.filter((p) => seleccionados.includes(p.id))}
          onCerrar={() => setCompartiendo(false)}
        />
      )}
    </div>
  );
}

// Modal para trasladar los préstamos seleccionados a otro celular (prestador principal
// ⇄ prestador auxiliar) mediante un link que viaja por WhatsApp. No usa servidor: todo el
// contenido queda codificado en el propio link. Si el préstamo ya trae designado quién es
// el auxiliar (o, al revés, ya se guardó que tú eres el auxiliar de alguien más), y ya
// tienes tus datos guardados de una vez anterior, no se vuelve a pedir nada: se arma solo.
function CompartirModal({ cliente, prestamos, onCerrar }) {
  // ¿Todos los préstamos seleccionados ya me marcan a mí como el auxiliar de alguien más?
  const todosSoyAuxiliar = prestamos.length > 0 && prestamos.every((p) => p.transferencia && p.transferencia.rol === "auxiliar");
  const contraparteAuxiliar = todosSoyAuxiliar ? prestamos[0].transferencia.contraparte : null;
  const mismoPrincipal = todosSoyAuxiliar && prestamos.every((p) => p.transferencia.contraparte.telefono === contraparteAuxiliar.telefono);

  // ¿Todos los préstamos seleccionados tienen designado al mismo prestador auxiliar (yo soy el principal)?
  const auxiliarUnico = !todosSoyAuxiliar && prestamos.length > 0 && prestamos.every((p) => p.auxiliar && p.auxiliar.telefono === prestamos[0].auxiliar?.telefono) ? prestamos[0].auxiliar : null;

  const rolSugerido = mismoPrincipal ? "auxiliar" : "principal";
  const [rol, setRol] = useState(rolSugerido);
  const [nombreYo, setNombreYo] = useState("");
  const [telefonoYo, setTelefonoYo] = useState("");
  const [telefonoDestino, setTelefonoDestino] = useState(mismoPrincipal ? contraparteAuxiliar.telefono : (auxiliarUnico ? auxiliarUnico.telefono : ""));
  const [nombreDestino, setNombreDestino] = useState(mismoPrincipal ? contraparteAuxiliar.nombre : (auxiliarUnico ? auxiliarUnico.nombre : ""));
  const [editandoMisDatos, setEditandoMisDatos] = useState(false);
  const [misDatosCargados, setMisDatosCargados] = useState(false);
  const [link, setLink] = useState(null);

  // Mis propios datos (nombre/teléfono) se guardan una sola vez para no volver a pedirlos.
  useEffect(() => {
    (async () => {
      try {
        const r = await window.storage.get("miPerfil", false);
        if (r && r.value) {
          const perfil = JSON.parse(r.value);
          if (perfil.nombre) setNombreYo(perfil.nombre);
          if (perfil.telefono) setTelefonoYo(perfil.telefono);
        }
      } catch (e) { /* aún no se ha guardado */ }
      finally { setMisDatosCargados(true); }
    })();
  }, []);

  const telOk = telefonoDestino.replace(/\D/g, "").length === 10;
  const misDatosListos = nombreYo.trim().length > 0;
  const listo = misDatosListos && telOk;
  // Si ya se sabe el rol, el destino y mis datos, no hace falta mostrar el formulario:
  // se arma y se ofrece mandar directo.
  const todoResuelto = misDatosCargados && listo && !editandoMisDatos && (mismoPrincipal || auxiliarUnico);

  function guardarMisDatos() {
    const perfil = { nombre: nombreYo.trim(), telefono: telefonoYo.replace(/\D/g, "") };
    window.storage.set("miPerfil", JSON.stringify(perfil), false).catch(() => {});
  }

  function generar() {
    if (!listo) return;
    guardarMisDatos();
    const paquete = empaquetarPrestamos(prestamos, [cliente], { nombre: nombreYo.trim(), telefono: telefonoYo.replace(/\D/g, ""), rol });
    setLink(construirLinkCompartir(paquete));
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onCerrar}>
      <div style={{ background: "var(--surface)", borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 18 }}>Enviar préstamos por WhatsApp</div>
          <button onClick={onCerrar} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer" }}><X size={20} /></button>
        </div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{prestamos.length} préstamo{prestamos.length === 1 ? "" : "s"} de {cliente.nombre}. Quien reciba el link podrá importarlos a su propia cartera, con el rol contrario al tuyo.</div>

        {todoResuelto ? (
          <div style={{ ...cardStyle, marginBottom: 4 }}>
            <div style={{ fontSize: 13 }}>Vas a enviar como <b style={{ color: "var(--gold)" }}>{rol === "auxiliar" ? "prestador auxiliar" : "prestador principal"}</b>, a nombre de <b>{nombreYo}</b>, para <b>{nombreDestino || telefonoDestino}</b>.</div>
            <button type="button" onClick={() => setEditandoMisDatos(true)} style={{ ...btnGhost, marginTop: 10, padding: "5px 9px", fontSize: 12 }}><Pencil size={12} /> Cambiar datos</button>
          </div>
        ) : (
          <>
            <SectionLabel icon={UserCog}>¿Cuál es tu rol en estos préstamos?</SectionLabel>
            <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
              <button type="button" onClick={() => setRol("principal")} style={{ ...pillBtn, flex: 1, background: rol === "principal" ? "var(--gold)" : "var(--surface2)", color: rol === "principal" ? "#1A130A" : "var(--text)", borderColor: rol === "principal" ? "var(--gold)" : "var(--border)" }}>Soy el principal</button>
              <button type="button" onClick={() => setRol("auxiliar")} style={{ ...pillBtn, flex: 1, background: rol === "auxiliar" ? "var(--gold)" : "var(--surface2)", color: rol === "auxiliar" ? "#1A130A" : "var(--text)", borderColor: rol === "auxiliar" ? "var(--gold)" : "var(--border)" }}>Soy el auxiliar</button>
            </div>

            <Field label="Tu nombre (para que lo identifiquen)"><input value={nombreYo} onChange={(e) => setNombreYo(e.target.value)} style={inputStyle} placeholder="Ej. Juan Pérez" /></Field>
            <Field label="Tu teléfono (opcional, para que te puedan responder)"><input value={telefonoYo} onChange={(e) => setTelefonoYo(e.target.value)} style={inputStyle} placeholder="10 dígitos" /></Field>
            <CampoTelefono
              label="Teléfono de quien lo va a recibir (10 dígitos)"
              value={telefonoDestino}
              onChange={setTelefonoDestino}
              onNombreDetectado={(n) => { if (!nombreDestino.trim()) setNombreDestino(n); }}
            />
            {editandoMisDatos && (
              <button type="button" onClick={() => setEditandoMisDatos(false)} style={{ ...btnGhost, marginBottom: 10, padding: "5px 9px", fontSize: 12 }}>Listo</button>
            )}

            {!listo && <div style={{ color: "var(--red)", fontSize: 13, marginTop: 4, marginBottom: 4 }}>Escribe tu nombre y un teléfono de destino válido.</div>}
          </>
        )}

        {!link ? (
          <button type="button" disabled={!listo} onClick={generar} style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginTop: 12, opacity: listo ? 1 : 0.5 }}>Generar link de traslado</button>
        ) : (
          <a
            href={waLink(telefonoDestino, mensajeCompartirPaquete({ remitente: { nombre: nombreYo.trim(), telefono: telefonoYo.replace(/\D/g, ""), rol }, prestamos }, link))}
            target="_blank" rel="noopener noreferrer"
            style={{ ...btnWhatsapp, width: "100%", marginTop: 12 }}
            onClick={onCerrar}
          >
            <MessageCircle size={16} /> Enviar por WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}

// Pantalla de confirmación al abrir un link de traslado. No se guarda nada hasta que el
// usuario toca "Importar". Para cada cliente que viene en el paquete, se sugiere si ya
// existe en la cartera local (por teléfono exacto o nombre parecido, tolerando acentos,
// apellidos de más o de menos) para no crear un cliente duplicado por un error de dedo.
function ImportarPaquete({ paquete, error, clientesLocales, prestamosLocales, onImportar, onDescartar }) {
  const [resultado, setResultado] = useState(null);
  const [decisiones, setDecisiones] = useState(null);

  // Se calculan las sugerencias solo una vez, al recibir el paquete.
  useEffect(() => {
    if (!paquete) return;
    const iniciales = {};
    (paquete.clientes || []).forEach((c) => {
      const exactoPorTelefono = clientesLocales.find((lc) => lc.telefono && lc.telefono === c.telefono);
      if (exactoPorTelefono) { iniciales[c.id] = exactoPorTelefono.id; return; }
      const candidatos = candidatosCliente(c, clientesLocales);
      iniciales[c.id] = candidatos.length > 0 ? candidatos[0].id : "nuevo";
    });
    setDecisiones(iniciales);
  }, [paquete]);

  if (error) {
    return (
      <div style={{ padding: "16px 16px 24px" }}>
        <div style={{ ...cardStyle, borderColor: "var(--red)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--red)", fontWeight: 700, marginBottom: 6 }}><AlertCircle size={16} /> No se pudo leer el link</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>{error}</div>
        </div>
        <button onClick={onDescartar} style={{ ...btnGhostFull, marginTop: 14 }}>Entendido</button>
      </div>
    );
  }
  if (!paquete || !decisiones) return null;

  if (resultado !== null) {
    return (
      <div style={{ padding: "16px 16px 24px" }}>
        <div style={{ ...cardStyle, borderColor: "var(--green)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--green)", fontWeight: 700, marginBottom: 6 }}><Check size={16} /> Listo</div>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            {resultado.agregados > 0 && <>Se agregaron {resultado.agregados} préstamo{resultado.agregados === 1 ? "" : "s"} nuevo{resultado.agregados === 1 ? "" : "s"}. </>}
            {resultado.actualizados > 0 && <>Se actualizaron {resultado.actualizados} préstamo{resultado.actualizados === 1 ? "" : "s"} que ya tenías, con los pagos más recientes de ambos lados.</>}
          </div>
        </div>
        <button onClick={onDescartar} style={{ ...btnPrimary, marginTop: 14, width: "100%", justifyContent: "center" }}>Ir a mis clientes</button>
      </div>
    );
  }

  const remitente = paquete.remitente || {};
  const rolRemitente = remitente.rol === "auxiliar" ? "prestador auxiliar" : "prestador principal";
  const rolReceptor = remitente.rol === "auxiliar" ? "prestador principal" : "prestador auxiliar";
  const totalMonto = paquete.prestamos.reduce((s, p) => s + Number(p.monto || 0), 0);
  const yaExistiaAlgun = paquete.prestamos.some((p) => prestamosLocales.some((lp) => lp.transferId === p.id || lp.id === p.id));

  return (
    <div style={{ padding: "16px 16px 24px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 19, marginBottom: 6 }}>Te compartieron préstamos</div>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
        <b style={{ color: "var(--text)" }}>{remitente.nombre || "Alguien"}</b> ({remitente.telefono || "sin teléfono"}) te envió esto como <b style={{ color: "var(--gold)" }}>{rolRemitente}</b>. Si lo importas, quedarás tú como <b style={{ color: "var(--gold)" }}>{rolReceptor}</b> de estos préstamos.
      </div>

      <div style={{ ...cardStyle }}>
        <Row label="Clientes" value={String(paquete.clientes.length)} />
        <Row label="Préstamos" value={String(paquete.prestamos.length)} />
        <Row label="Monto total" value={fmtMoney(totalMonto)} last />
      </div>

      {yaExistiaAlgun && (
        <div style={{ fontSize: 12, color: "var(--gold)", marginTop: 10 }}>Algunos de estos préstamos ya los tenías; se actualizarán con los pagos nuevos en vez de duplicarse.</div>
      )}

      <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>¿A quién corresponde cada cliente?</div>
      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Si el nombre no coincide exacto con uno que ya tienes (acentos, apellidos de más o de menos), revisa la sugerencia o elige manualmente.</div>
      {paquete.clientes.map((c) => {
        const suyos = paquete.prestamos.filter((p) => p.clienteId === c.id);
        const candidatos = candidatosCliente(c, clientesLocales);
        const candidatoIds = new Set(candidatos.map((cl) => cl.id));
        const resto = clientesLocales.filter((cl) => !candidatoIds.has(cl.id));
        return (
          <div key={c.id} style={cardStyle}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre} <span style={{ color: "var(--muted)", fontWeight: 400 }}>({c.telefono || "sin teléfono"})</span></div>
            {suyos.map((p) => (
              <div key={p.id} style={{ fontSize: 13, color: "var(--muted)", marginTop: 4 }}>· {fmtMoney(p.monto)} — otorgado el {fmtDate(p.fechaOrigen)}</div>
            ))}
            <select
              value={decisiones[c.id] || "nuevo"}
              onChange={(e) => setDecisiones((d) => ({ ...d, [c.id]: e.target.value }))}
              style={{ ...inputStyle, marginTop: 10 }}
            >
              <option value="nuevo">➕ Es un cliente nuevo</option>
              {candidatos.length > 0 && (
                <optgroup label="Se parece a...">
                  {candidatos.map((cl) => <option key={cl.id} value={cl.id}>{cl.nombre} — {cl.telefono}</option>)}
                </optgroup>
              )}
              {resto.length > 0 && (
                <optgroup label="Todos mis clientes">
                  {resto.map((cl) => <option key={cl.id} value={cl.id}>{cl.nombre} — {cl.telefono}</option>)}
                </optgroup>
              )}
            </select>
          </div>
        );
      })}

      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>Los comprobantes de pago no se incluyen en este traslado.</div>

      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onDescartar} style={btnGhostFull}><X size={15} /> Descartar</button>
        <button onClick={() => setResultado(onImportar(paquete, decisiones))} style={{ ...btnGhostFull, flex: 1, background: "var(--gold)", color: "#1A130A", borderColor: "var(--gold)" }}>Importar</button>
      </div>
    </div>
  );
}

function EditarCliente({ cliente, onGuardar, onCancelar }) {
  const [nombre, setNombre] = useState(cliente.nombre);
  const [trabajo, setTrabajo] = useState(cliente.trabajo || "");
  const [domicilio, setDomicilio] = useState(cliente.domicilio || "");
  const [telefono, setTelefono] = useState(cliente.telefono || "");
  const [tocado, setTocado] = useState(false);

  const telOk = telefono.replace(/\D/g, "").length === 10;
  const valido = nombre.trim() && telOk;

  function submit(e) {
    e.preventDefault();
    setTocado(true);
    if (!valido) return;
    onGuardar({ nombre: nombre.trim(), trabajo: trabajo.trim(), domicilio: domicilio.trim(), telefono: telefono.replace(/\D/g, "") });
  }

  return (
    <form onSubmit={submit} style={{ padding: "16px 16px 24px" }} autoComplete="off">
      <button type="button" onClick={onCancelar} style={{ ...btnGhost, marginBottom: 14, padding: "6px 10px" }}><ChevronLeft size={16} /> Cancelar</button>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 19, marginBottom: 16 }}>Editar cliente</div>
      <Field label="Nombre completo"><input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} autoComplete="off" /></Field>
      <Field label="Lugar donde labora"><input value={trabajo} onChange={(e) => setTrabajo(e.target.value)} style={inputStyle} autoComplete="off" /></Field>
      <Field label="Dónde vive (domicilio)"><input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} style={inputStyle} autoComplete="off" /></Field>
      <CampoTelefono
        label="Teléfono celular (10 dígitos)"
        value={telefono}
        onChange={setTelefono}
        onNombreDetectado={(n) => { if (!nombre.trim()) setNombre(n); }}
      />
      {tocado && !valido && <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>Revisa el nombre y que el teléfono tenga 10 dígitos.</div>}
      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button type="button" onClick={onCancelar} style={btnGhostFull}>Cancelar</button>
        <button type="submit" style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}>Guardar cambios</button>
      </div>
    </form>
  );
}

/* ---------------- formulario nuevo préstamo ---------------- */

function NuevoPrestamo({ clientes, auxiliares, presetClienteId, duenoCartera, onGuardar, onCancelar }) {
  const clientePreset = presetClienteId ? clientes.find((c) => c.id === presetClienteId) : null;

  const [modoCliente, setModoCliente] = useState(clientePreset ? "existente" : (clientes.length > 0 ? "existente" : "nuevo"));
  const [clienteSel, setClienteSel] = useState(clientePreset ? clientePreset.id : "");
  const [busqueda, setBusqueda] = useState("");

  const [nombre, setNombre] = useState("");
  const [trabajo, setTrabajo] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [telefono, setTelefono] = useState("");

  const [monto, setMonto] = useState("");
  const [tasaInteres, setTasaInteres] = useState("");
  const [fechaOrigen, setFechaOrigen] = useState(() => toISO(new Date()));

  const [tipoFrec, setTipoFrec] = useState("mensual");
  const [diaSemana, setDiaSemana] = useState(1);
  const [personalizadoModo, setPersonalizadoModo] = useState("dias");
  const [diasSemana, setDiasSemana] = useState([1]);
  const [fechasMes, setFechasMes] = useState([]);
  const [fechaMesInput, setFechaMesInput] = useState("");
  const [intervaloDiaSemana, setIntervaloDiaSemana] = useState(1);
  const [intervaloSemanas, setIntervaloSemanas] = useState("2");
  const [intervaloOffset, setIntervaloOffset] = useState(0);
  const [mesModo, setMesModo] = useState("origen");
  const [diaMes, setDiaMes] = useState(1);

  const [cuotaManual, setCuotaManual] = useState(false);
  const [cuotaCustom, setCuotaCustom] = useState("");

  const [tieneAuxiliar, setTieneAuxiliar] = useState(false);
  const [auxNombre, setAuxNombre] = useState("");
  const [auxTelefono, setAuxTelefono] = useState("");
  const [auxPorcentaje, setAuxPorcentaje] = useState("");

  // Si quien está dando de alta el préstamo no es el prestador principal (por ejemplo,
  // el auxiliar de alguien más está registrando el préstamo en su propio celular), se
  // guardan los datos del prestador principal para poder trasladarle luego el préstamo
  // por WhatsApp sin tener que volver a escribirlos.
  const [miRolPrestamo, setMiRolPrestamo] = useState("principal");
  const [principalNombre, setPrincipalNombre] = useState("");
  const [principalTelefono, setPrincipalTelefono] = useState("");

  // Se pregunta una sola vez, la primera vez que alguien registra un
  // préstamo como "prestador principal": ese nombre completo es el que
  // luego se usa para personalizar el título "Cartera {Nombre} {Apellido}".
  const [miNombreDueno, setMiNombreDueno] = useState("");
  const necesitaNombreDueno = miRolPrestamo === "principal" && !duenoCartera;

  const [tocado, setTocado] = useState(false);

  const frecuencia = tipoFrec === "semanal" ? { tipo: "semanal", diaSemana }
    : tipoFrec === "personalizado" ? (
      personalizadoModo === "fechas" ? { tipo: "personalizado", personalizadoModo: "fechasMes", fechasMes }
        : personalizadoModo === "intervalo" ? { tipo: "personalizado", personalizadoModo: "intervaloSemanal", diaSemana: intervaloDiaSemana, intervaloSemanas: Number(intervaloSemanas) || 2, offsetInicial: intervaloOffset }
          : { tipo: "personalizado", personalizadoModo: "diasSemana", diasSemana }
    )
      : tipoFrec === "quincenal" ? { tipo: "quincenal" }
        : { tipo: "mensual", mesModo, diaMes };

  const proximoPagoSugerido = calcularSiguientePago(fechaOrigen, frecuencia, fechaOrigen, true);
  const numPagosMes = pagosPorMes(frecuencia);
  const interesMensual = monto && tasaInteres !== "" ? Math.round((Number(monto) * Number(tasaInteres)) / 100) : 0;
  const cuotaSugerida = interesMensual > 0 ? Math.round(interesMensual / numPagosMes) : 0;
  const usandoManual = cuotaManual || cuotaSugerida <= 0;
  const cuotaFinal = usandoManual ? Number(cuotaCustom || 0) : cuotaSugerida;

  const telOk = telefono.replace(/\D/g, "").length === 10;
  const auxTelOk = auxTelefono.replace(/\D/g, "").length === 10;
  const principalTelOk = principalTelefono.replace(/\D/g, "").length === 10;
  const soyAuxiliar = miRolPrestamo === "auxiliar";
  const frecuenciaCompleta = tipoFrec !== "personalizado" || (personalizadoModo === "fechas" ? fechasMes.length > 0 : personalizadoModo === "intervalo" ? Number(intervaloSemanas) > 0 : diasSemana.length > 0);
  const clienteValido = modoCliente === "existente" ? !!clienteSel : (nombre.trim() && telOk);

  const valido = clienteValido && monto && Number(monto) > 0 && tasaInteres !== "" && frecuenciaCompleta &&
    (usandoManual ? cuotaCustom !== "" && Number(cuotaCustom) > 0 : cuotaSugerida > 0) &&
    (soyAuxiliar ? (principalNombre.trim() && principalTelOk) : (!tieneAuxiliar || (auxNombre.trim() && auxTelOk && auxPorcentaje !== ""))) &&
    (!necesitaNombreDueno || miNombreDueno.trim().length > 0);

  const auxMontoPreview = tieneAuxiliar && auxPorcentaje !== "" && cuotaFinal ? Math.round((cuotaFinal * Number(auxPorcentaje)) / 100) : 0;

  const faltantes = [];
  if (modoCliente === "existente" && !clienteSel) faltantes.push("selecciona un cliente");
  if (modoCliente === "nuevo" && !nombre.trim()) faltantes.push("nombre del cliente");
  if (modoCliente === "nuevo" && !telOk) faltantes.push(`teléfono del cliente a 10 dígitos (llevas ${telefono.replace(/\D/g, "").length})`);
  if (!monto || Number(monto) <= 0) faltantes.push("monto prestado (debe ser mayor a 0)");
  if (tasaInteres === "") faltantes.push("interés mensual (puede ser 0)");
  if (!frecuenciaCompleta) faltantes.push(personalizadoModo === "fechas" ? "al menos una fecha del mes" : "al menos un día de la semana");
  if (usandoManual ? (cuotaCustom === "" || Number(cuotaCustom) <= 0) : cuotaSugerida <= 0) faltantes.push("monto de pago");
  if (tieneAuxiliar && !auxNombre.trim()) faltantes.push("nombre del auxiliar");
  if (tieneAuxiliar && !auxTelOk) faltantes.push(`teléfono del auxiliar a 10 dígitos (llevas ${auxTelefono.replace(/\D/g, "").length})`);
  if (tieneAuxiliar && auxPorcentaje === "") faltantes.push("porcentaje del auxiliar");
  if (soyAuxiliar && !principalNombre.trim()) faltantes.push("nombre del prestador principal");
  if (soyAuxiliar && !principalTelOk) faltantes.push(`teléfono del prestador principal a 10 dígitos (llevas ${principalTelefono.replace(/\D/g, "").length})`);
  if (necesitaNombreDueno && !miNombreDueno.trim()) faltantes.push("tu nombre completo (para el título de tu cartera)");

  function toggleDiaPersonalizado(d) {
    setDiasSemana((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  }
  function agregarFechaMes() {
    const n = Number(fechaMesInput);
    if (!n || n < 1 || n > 31) return;
    if (!fechasMes.includes(n)) setFechasMes([...fechasMes, n].sort((a, b) => a - b));
    setFechaMesInput("");
  }
  function quitarFechaMes(n) { setFechasMes(fechasMes.filter((x) => x !== n)); }

  function submit(e) {
    e.preventDefault();
    setTocado(true);
    if (!valido) return;
    const prestamoData = {
      monto: Number(monto),
      montoOriginal: Number(monto),
      tasaInteres: Number(tasaInteres),
      cuota: cuotaFinal,
      fechaOrigen,
      frecuencia,
      proximoPago: proximoPagoSugerido,
      liquidado: false,
      capitalPendiente: Number(monto),
      abonoParcialActual: 0,
      auxiliar: !soyAuxiliar && tieneAuxiliar ? { nombre: auxNombre.trim(), telefono: auxTelefono.replace(/\D/g, ""), porcentaje: Number(auxPorcentaje) } : null,
      ...(soyAuxiliar ? {
        transferencia: {
          rol: "auxiliar",
          contraparte: { nombre: principalNombre.trim(), telefono: principalTelefono.replace(/\D/g, "") },
          recibidoEl: null,
        },
      } : {}),
    };
    if (modoCliente === "existente") {
      onGuardar({ clienteId: clienteSel, prestamo: prestamoData, duenoNombre: necesitaNombreDueno ? miNombreDueno.trim() : undefined });
    } else {
      onGuardar({
        clienteNuevo: { nombre: nombre.trim(), trabajo: trabajo.trim(), domicilio: domicilio.trim(), telefono: telefono.replace(/\D/g, "") },
        prestamo: prestamoData,
        duenoNombre: necesitaNombreDueno ? miNombreDueno.trim() : undefined,
      });
    }
  }

  const clientesFiltrados = clientes.filter((c) => c.nombre.toLowerCase().includes(busqueda.toLowerCase()));

  return (
    <form onSubmit={submit} style={{ padding: "16px 16px 24px" }} autoComplete="off">
      <div style={{ fontFamily: "var(--font-display)", fontSize: 19, marginBottom: 16 }}>Nuevo préstamo</div>

      <SectionLabel icon={Users}>Cliente</SectionLabel>

      {!clientePreset && clientes.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button type="button" onClick={() => setModoCliente("existente")} style={{ ...pillBtn, flex: 1, background: modoCliente === "existente" ? "var(--gold)" : "var(--surface2)", color: modoCliente === "existente" ? "#1A130A" : "var(--text)", borderColor: modoCliente === "existente" ? "var(--gold)" : "var(--border)" }}>Cliente ya registrado</button>
          <button type="button" onClick={() => setModoCliente("nuevo")} style={{ ...pillBtn, flex: 1, background: modoCliente === "nuevo" ? "var(--gold)" : "var(--surface2)", color: modoCliente === "nuevo" ? "#1A130A" : "var(--text)", borderColor: modoCliente === "nuevo" ? "var(--gold)" : "var(--border)" }}>Cliente nuevo</button>
        </div>
      )}

      {modoCliente === "existente" && clientePreset && (
        <div style={cardStyle}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{clientePreset.nombre}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{clientePreset.telefono}</div>
        </div>
      )}

      {modoCliente === "existente" && !clientePreset && (
        <>
          <Field label="Buscar cliente"><input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} style={inputStyle} placeholder="Escribe un nombre..." /></Field>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14, maxHeight: 220, overflowY: "auto" }}>
            {clientesFiltrados.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13 }}>Sin resultados.</div>}
            {clientesFiltrados.map((c) => (
              <button key={c.id} type="button" onClick={() => setClienteSel(c.id)} style={{ textAlign: "left", padding: "10px 12px", borderRadius: 8, border: clienteSel === c.id ? "1.5px solid var(--gold)" : "1px solid var(--border)", background: clienteSel === c.id ? "rgba(227,162,60,0.1)" : "var(--surface2)", color: "var(--text)", cursor: "pointer" }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.telefono}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {modoCliente === "nuevo" && (
        <>
          <Field label="Nombre completo"><input value={nombre} onChange={(e) => setNombre(e.target.value)} style={inputStyle} placeholder="Ej. Juana Pérez López" autoComplete="off" /></Field>
          <Field label="Lugar donde labora"><input value={trabajo} onChange={(e) => setTrabajo(e.target.value)} style={inputStyle} placeholder="Ej. Farmacia San Rafael" autoComplete="off" /></Field>
          <Field label="Dónde vive (domicilio)"><input value={domicilio} onChange={(e) => setDomicilio(e.target.value)} style={inputStyle} placeholder="Calle, número, colonia" autoComplete="off" /></Field>
          <CampoTelefono
            label="Teléfono celular (10 dígitos)"
            value={telefono}
            onChange={setTelefono}
            placeholder="6621234567"
            onNombreDetectado={(n) => { if (!nombre.trim()) setNombre(n); }}
          />
        </>
      )}

      <Field label="Fecha en que se genera este préstamo">
        <div style={{ overflow: "hidden", borderRadius: 8 }}>
          <input value={fechaOrigen} onChange={(e) => setFechaOrigen(e.target.value)} type="date" style={{ ...inputStyle, height: 40, lineHeight: "20px", display: "block", width: "100%", maxWidth: "100%" }} />
        </div>
      </Field>

      <SectionLabel icon={FileText}>Frecuencia de cobro</SectionLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["semanal", "Semanal"], ["quincenal", "Quincenal"], ["mensual", "Mensual"], ["personalizado", "Personalizado"]].map(([key, label]) => (
          <button key={key} type="button" onClick={() => setTipoFrec(key)} style={{ ...pillBtn, flex: "1 1 45%", background: tipoFrec === key ? "var(--gold)" : "var(--surface2)", color: tipoFrec === key ? "#1A130A" : "var(--text)", borderColor: tipoFrec === key ? "var(--gold)" : "var(--border)" }}>{label}</button>
        ))}
      </div>

      {tipoFrec === "semanal" && (
        <Field label="Cada">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {DIAS_SEMANA_ORDEN.map((d) => (
              <button key={d} type="button" onClick={() => setDiaSemana(d)} style={{ ...dayPill, background: diaSemana === d ? "var(--gold)" : "var(--surface2)", color: diaSemana === d ? "#1A130A" : "var(--text)", borderColor: diaSemana === d ? "var(--gold)" : "var(--border)" }}>{DIAS_SEMANA[d].slice(0, 3)}</button>
            ))}
          </div>
        </Field>
      )}

      {tipoFrec === "personalizado" && (
        <>
          <Field label="Tipo de condición">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setPersonalizadoModo("dias")} style={{ ...pillBtn, flex: "1 1 28%", background: personalizadoModo === "dias" ? "var(--gold)" : "var(--surface2)", color: personalizadoModo === "dias" ? "#1A130A" : "var(--text)", borderColor: personalizadoModo === "dias" ? "var(--gold)" : "var(--border)" }}>Días de la semana</button>
              <button type="button" onClick={() => setPersonalizadoModo("fechas")} style={{ ...pillBtn, flex: "1 1 28%", background: personalizadoModo === "fechas" ? "var(--gold)" : "var(--surface2)", color: personalizadoModo === "fechas" ? "#1A130A" : "var(--text)", borderColor: personalizadoModo === "fechas" ? "var(--gold)" : "var(--border)" }}>Fecha del mes</button>
              <button type="button" onClick={() => setPersonalizadoModo("intervalo")} style={{ ...pillBtn, flex: "1 1 28%", background: personalizadoModo === "intervalo" ? "var(--gold)" : "var(--surface2)", color: personalizadoModo === "intervalo" ? "#1A130A" : "var(--text)", borderColor: personalizadoModo === "intervalo" ? "var(--gold)" : "var(--border)" }}>Cada N semanas</button>
            </div>
          </Field>

          {personalizadoModo === "dias" && (
            <Field label="Días de cobro (elige uno o varios, cada semana)">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {DIAS_SEMANA_ORDEN.map((d) => (
                  <button key={d} type="button" onClick={() => toggleDiaPersonalizado(d)} style={{ ...dayPill, background: diasSemana.includes(d) ? "var(--gold)" : "var(--surface2)", color: diasSemana.includes(d) ? "#1A130A" : "var(--text)", borderColor: diasSemana.includes(d) ? "var(--gold)" : "var(--border)" }}>{DIAS_SEMANA[d].slice(0, 3)}</button>
                ))}
              </div>
            </Field>
          )}

          {personalizadoModo === "fechas" && (
            <Field label="Fechas del mes en que se cobra (las que necesites)">
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                <input value={fechaMesInput} onChange={(e) => setFechaMesInput(e.target.value)} type="number" min={1} max={31} style={{ ...inputStyle, flex: 1 }} placeholder="Ej. 5" />
                <button type="button" onClick={agregarFechaMes} style={{ ...pillBtn, padding: "10px 16px" }}>Agregar</button>
              </div>
              {fechasMes.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {fechasMes.map((n) => (
                    <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 20, padding: "5px 6px 5px 12px", fontSize: 13 }}>
                      Día {n}
                      <button type="button" onClick={() => quitarFechaMes(n)} style={{ width: 18, height: 18, borderRadius: "50%", border: "none", background: "var(--red)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
              {fechasMes.length === 0 && <div style={{ fontSize: 12, color: "var(--muted)" }}>Agrega cada fecha (día del mes) en la que se cobrará, por ejemplo 5 y 20.</div>}
            </Field>
          )}

          {personalizadoModo === "intervalo" && (
            <>
              <Field label="Día de la semana">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {DIAS_SEMANA_ORDEN.map((d) => (
                    <button key={d} type="button" onClick={() => setIntervaloDiaSemana(d)} style={{ ...dayPill, background: intervaloDiaSemana === d ? "var(--gold)" : "var(--surface2)", color: intervaloDiaSemana === d ? "#1A130A" : "var(--text)", borderColor: intervaloDiaSemana === d ? "var(--gold)" : "var(--border)" }}>{DIAS_SEMANA[d].slice(0, 3)}</button>
                  ))}
                </div>
              </Field>
              <Field label="Cada cuántas semanas">
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {[2, 3, 4].map((n) => (
                    <button key={n} type="button" onClick={() => setIntervaloSemanas(String(n))} style={{ ...pillBtn, background: intervaloSemanas === String(n) ? "var(--gold)" : "var(--surface2)", color: intervaloSemanas === String(n) ? "#1A130A" : "var(--text)", borderColor: intervaloSemanas === String(n) ? "var(--gold)" : "var(--border)" }}>{n} semanas</button>
                  ))}
                  <input value={intervaloSemanas} onChange={(e) => setIntervaloSemanas(e.target.value)} type="number" min={1} style={{ ...inputStyle, flex: "1 1 100px" }} placeholder="Otra" />
                </div>
              </Field>
              <Field label="¿Cuándo debe iniciar el primer cobro?">
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[
                    { offset: 0, label: "Próxima semana" },
                    { offset: 1, label: "En dos semanas" },
                    { offset: 2, label: "En tres semanas" },
                  ].map(({ offset, label }) => {
                    const fecha = toISO(addDays(nextWeekdaySingle(parseISO(fechaOrigen), intervaloDiaSemana, false), offset * 7));
                    const activo = intervaloOffset === offset;
                    return (
                      <button key={offset} type="button" onClick={() => setIntervaloOffset(offset)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", padding: "10px 12px", borderRadius: 8, border: activo ? "1.5px solid var(--gold)" : "1px solid var(--border)", background: activo ? "rgba(227,162,60,0.1)" : "var(--surface2)", color: "var(--text)", cursor: "pointer" }}>
                        <span style={{ fontWeight: 600, fontSize: 14 }}>{label}</span>
                        <span style={{ fontSize: 13, color: "var(--muted)", fontFamily: "var(--font-mono)" }}>{fmtDate(fecha)}</span>
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}
        </>
      )}

      {tipoFrec === "quincenal" && (
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, background: "var(--surface2)", padding: "10px 12px", borderRadius: 8 }}>
          Se cobrará siempre los días <b>15</b> y el <b>último día</b> de cada mes.
        </div>
      )}

      {tipoFrec === "mensual" && (
        <>
          <Field label="¿Qué día del mes se cobra?">
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={() => setMesModo("origen")} style={{ ...pillBtn, flex: 1, background: mesModo === "origen" ? "var(--gold)" : "var(--surface2)", color: mesModo === "origen" ? "#1A130A" : "var(--text)", borderColor: mesModo === "origen" ? "var(--gold)" : "var(--border)" }}>Día del préstamo</button>
              <button type="button" onClick={() => setMesModo("custom")} style={{ ...pillBtn, flex: 1, background: mesModo === "custom" ? "var(--gold)" : "var(--surface2)", color: mesModo === "custom" ? "#1A130A" : "var(--text)", borderColor: mesModo === "custom" ? "var(--gold)" : "var(--border)" }}>Elegir otro día</button>
            </div>
          </Field>
          {mesModo === "custom" && (
            <Field label="Día del mes">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={diaMes === "ultimo" ? "" : diaMes} disabled={diaMes === "ultimo"} onChange={(e) => setDiaMes(Number(e.target.value))} type="number" min={1} max={31} style={{ ...inputStyle, flex: 1 }} placeholder="Ej. 5" />
                <button type="button" onClick={() => setDiaMes(diaMes === "ultimo" ? 1 : "ultimo")} style={{ ...pillBtn, background: diaMes === "ultimo" ? "var(--gold)" : "var(--surface2)", color: diaMes === "ultimo" ? "#1A130A" : "var(--text)", borderColor: diaMes === "ultimo" ? "var(--gold)" : "var(--border)", whiteSpace: "nowrap", padding: "10px 12px" }}>Último día</button>
              </div>
            </Field>
          )}
        </>
      )}

      <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 18 }}>
        Primer cobro sugerido: <b style={{ color: "var(--text)" }}>{fmtDate(proximoPagoSugerido)}</b> · se cobra {numPagosMes} {numPagosMes === 1 ? "vez" : "veces"} al mes con esta frecuencia.
      </div>

      <SectionLabel icon={FileText}>Datos del préstamo</SectionLabel>
      <div style={{ display: "flex", gap: 10 }}>
        <Field label="Monto prestado" style={{ flex: 1 }}><input value={monto} onChange={(e) => setMonto(e.target.value.replace("-", ""))} type="number" min="0" style={inputStyle} placeholder="5000" /></Field>
        <Field label="Interés mensual (%)" style={{ flex: 1 }}><input value={tasaInteres} onChange={(e) => setTasaInteres(e.target.value)} type="number" style={inputStyle} placeholder="10" /></Field>
      </div>
      {interesMensual > 0 && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 14 }}>
          Interés generado cada mes sobre el monto prestado: <b style={{ color: "var(--gold)" }}>{fmtMoney(interesMensual)}</b>
        </div>
      )}

      <Field label="Monto de cada pago">
        <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px" }}>
          {!cuotaManual && cuotaSugerida > 0 ? (
            <>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700 }}>{fmtMoney(cuotaSugerida)}</div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                Interés mensual ({fmtMoney(interesMensual)}) ÷ {numPagosMes} pago(s) al mes
              </div>
            </>
          ) : (
            <>
              {cuotaSugerida <= 0 && (
                <div style={{ fontSize: 12, color: "var(--gold)", marginBottom: 8 }}>
                  No se pudo calcular el pago automático (interés en 0 o sin datos). Escribe el monto que pagará el cliente:
                </div>
              )}
              <input value={cuotaCustom} onChange={(e) => setCuotaCustom(e.target.value)} type="number" style={{ ...inputStyle, background: "var(--surface)" }} placeholder="Monto que el cliente pagará" />
            </>
          )}
          {cuotaSugerida > 0 && (
            <button type="button" onClick={() => { setCuotaManual((v) => !v); if (!cuotaManual) setCuotaCustom(cuotaSugerida ? String(cuotaSugerida) : ""); }} style={{ ...pillBtn, marginTop: 10, fontSize: 12, padding: "6px 10px" }}>
              {cuotaManual ? "Usar el cálculo automático" : "El cliente pagará otra cantidad"}
            </button>
          )}
        </div>
      </Field>

      <SectionLabel icon={UserCog}>¿Cuál es tu rol en este préstamo?</SectionLabel>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button type="button" onClick={() => setMiRolPrestamo("principal")} style={{ ...pillBtn, flex: 1, background: !soyAuxiliar ? "var(--gold)" : "var(--surface2)", color: !soyAuxiliar ? "#1A130A" : "var(--text)", borderColor: !soyAuxiliar ? "var(--gold)" : "var(--border)" }}>Soy el prestador principal</button>
        <button type="button" onClick={() => setMiRolPrestamo("auxiliar")} style={{ ...pillBtn, flex: 1, background: soyAuxiliar ? "var(--gold)" : "var(--surface2)", color: soyAuxiliar ? "#1A130A" : "var(--text)", borderColor: soyAuxiliar ? "var(--gold)" : "var(--border)" }}>Soy el auxiliar de otra persona</button>
      </div>

      {necesitaNombreDueno && (
        <Field label="Tu nombre completo (se usará para el título de tu cartera)">
          <input value={miNombreDueno} onChange={(e) => setMiNombreDueno(e.target.value)} style={inputStyle} placeholder="Ej. José Antonio Miramontes Escobedo" autoComplete="off" />
        </Field>
      )}

      {soyAuxiliar ? (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 12 }}>
            El dinero es de otra persona; tú solo le das seguimiento. Después podrás enviarle este préstamo por WhatsApp para que lo tenga en su propia app.
          </div>
          <Field label="Nombre del prestador principal"><input value={principalNombre} onChange={(e) => setPrincipalNombre(e.target.value)} style={inputStyle} placeholder="Ej. Rosa Martínez" /></Field>
          <CampoTelefono
            label="Teléfono del prestador principal (10 dígitos)"
            value={principalTelefono}
            onChange={setPrincipalTelefono}
            placeholder="6621234567"
            onNombreDetectado={(n) => { if (!principalNombre.trim()) setPrincipalNombre(n); }}
          />
        </>
      ) : (
        <>
          <SectionLabel icon={UserCog}>Prestador auxiliar (opcional)</SectionLabel>
          <button type="button" onClick={() => setTieneAuxiliar((v) => !v)} style={{ ...pillBtn, marginBottom: 12, background: tieneAuxiliar ? "var(--gold)" : "var(--surface2)", color: tieneAuxiliar ? "#1A130A" : "var(--text)", borderColor: tieneAuxiliar ? "var(--gold)" : "var(--border)" }}>
            {tieneAuxiliar ? "Sí, hay un prestador auxiliar" : "Agregar prestador auxiliar"}
          </button>
          {tieneAuxiliar && (
            <>
              {auxiliares.length > 0 && (
                <Field label="Auxiliares guardados (toca para autocompletar)">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {auxiliares.map((a) => (
                      <button key={a.id} type="button" onClick={() => { setAuxNombre(a.nombre); setAuxTelefono(a.telefono); }} style={{ ...pillBtn, background: auxTelefono === a.telefono ? "var(--gold)" : "var(--surface2)", color: auxTelefono === a.telefono ? "#1A130A" : "var(--text)", borderColor: auxTelefono === a.telefono ? "var(--gold)" : "var(--border)" }}>{a.nombre}</button>
                    ))}
                  </div>
                </Field>
              )}
              <Field label="Nombre del auxiliar"><input value={auxNombre} onChange={(e) => setAuxNombre(e.target.value)} style={inputStyle} placeholder="Ej. Carlos Ruiz" autoComplete="off" /></Field>
              <CampoTelefono
                label="Teléfono del auxiliar (10 dígitos, para enviarle recordatorios por WhatsApp)"
                value={auxTelefono}
                onChange={setAuxTelefono}
                placeholder="6621234567"
                onNombreDetectado={(n) => { if (!auxNombre.trim()) setAuxNombre(n); }}
              />
              <Field label="Porcentaje que recibe de cada pago"><input value={auxPorcentaje} onChange={(e) => setAuxPorcentaje(e.target.value)} type="number" style={inputStyle} placeholder="10" /></Field>
              {auxPorcentaje !== "" && cuotaFinal > 0 && (
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 14 }}>
                  Recibirá <b style={{ color: "var(--gold)" }}>{fmtMoney(auxMontoPreview)}</b> por cada pago de {fmtMoney(cuotaFinal)}.
                </div>
              )}
            </>
          )}
        </>
      )}

      <div style={{ fontSize: 12, color: "var(--muted)", margin: "6px 0 18px", fontStyle: "italic" }}>
        Podrás adjuntar el pagaré, INE y comprobante de domicilio después de guardar, desde la ficha del préstamo.
      </div>

      {tocado && !valido && (
        <div style={{ color: "var(--red)", fontSize: 13, marginBottom: 12 }}>
          Falta: {faltantes.join(", ")}.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
        <button type="button" onClick={onCancelar} style={btnGhostFull}>Cancelar</button>
        <button type="submit" style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}>Guardar préstamo</button>
      </div>
    </form>
  );
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--gold)", textTransform: "uppercase", letterSpacing: "0.08em", margin: "18px 0 10px", fontWeight: 700 }}>
      <Icon size={13} /> {children}
    </div>
  );
}

/* ---------------- modal de marcar pagado ---------------- */

function PagoModal({ pago, onCancelar, onConfirmar }) {
  const { modo, prestamos } = pago;
  const [paso, setPaso] = useState("tipo");
  const [tipo, setTipo] = useState(null);
  const [montoParcial, setMontoParcial] = useState("");
  const [comprobante, setComprobante] = useState(null);
  const [subiendo, setSubiendo] = useState(false);
  const inputFoto = useRef(null);
  const inputArchivo = useRef(null);

  const p = prestamos[0];
  const hoyISO = toISO(new Date());
  const ayerISO = toISO(addDays(new Date(), -1));
  // No se puede registrar un pago con fecha anterior a cuando se otorgó el préstamo. Si
  // son varios préstamos a la vez (modo "grupo"), se toma el más reciente de ellos, para
  // que la fecha elegida sea válida para todos.
  const fechaMinima = prestamos.reduce((max, pr) => (pr.fechaOrigen > max ? pr.fechaOrigen : max), prestamos[0] ? prestamos[0].fechaOrigen : hoyISO);
  const ayerValido = ayerISO >= fechaMinima;
  const [fechaPago, setFechaPago] = useState(hoyISO);
  const [fechaCustom, setFechaCustom] = useState(hoyISO);
  const [mostrarCalendario, setMostrarCalendario] = useState(false);
  const capitalPendiente = p ? (p.capitalPendiente == null ? p.monto : p.capitalPendiente) : 0;
  const montoLiquidacion = p ? capitalPendiente + interesPendienteDe(p, hoyISO) : 0;

  const totalCuota = modo === "grupo" ? prestamos.reduce((s, pr) => s + Number(pr.cuota), 0) : 0;
  const totalMontoCompleto = modo === "grupo" ? prestamos.reduce((s, pr) => s + montoPagoCompleto(pr, hoyISO), 0) : 0;
  const totalLiquidacion = modo === "grupo" ? prestamos.reduce((s, pr) => {
    const cap = pr.capitalPendiente == null ? pr.monto : pr.capitalPendiente;
    return s + cap + interesPendienteDe(pr, hoyISO);
  }, 0) : 0;
  const montoCompletoIndividual = p ? montoPagoCompleto(p, hoyISO) : 0;
  // El monto de "Pago completo" es lo realmente pendiente a la fecha —cuota fija si el
  // préstamo está congelado, interés generado y no pagado si es un préstamo normal—, no
  // la cuota nominal del periodo: si hay atraso de periodos anteriores, esta cantidad ya
  // lo incluye, para que cubrirla deje al cliente al día.
  const montoCompletoMostrado = modo === "grupo" ? totalMontoCompleto : montoCompletoIndividual;
  const cuotaReferencia = modo === "grupo" ? totalCuota : (p ? p.cuota : 0);
  const hayAtraso = montoCompletoMostrado > cuotaReferencia;
  const montoLiquidacionMostrado = modo === "grupo" ? totalLiquidacion : montoLiquidacion;
  const algunoCongelado = modo === "grupo" ? prestamos.some((pr) => pr.congelado) : !!(p && p.congelado);

  function elegirTipo(t) {
    setTipo(t);
    if (modo === "grupo" && t === "parcial") { setPaso("grupoParcialInfo"); return; }
    setPaso(t === "parcial" ? "montoParcial" : "confirmarMonto");
  }
  function volverATipo() { setTipo(null); setMontoParcial(""); setPaso("tipo"); }
  function confirmarMontoFijo() { setMostrarCalendario(false); setPaso("fecha"); }
  function confirmarMontoParcial() {
    if (!montoParcial || Number(montoParcial) <= 0) return;
    setMostrarCalendario(false);
    setPaso("fecha");
  }
  function elegirFecha(f) {
    if (f < fechaMinima) return; // no se permite una fecha anterior a la del préstamo
    setFechaPago(f);
    setPaso("comprobante");
  }

  async function manejarArchivo(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setComprobante({ nombre: file.name || "comprobante.jpg", tipo: file.type || "image/jpeg", dataUrl });
    } catch (err) { /* no se pudo procesar */ }
    setSubiendo(false);
  }

  function finalizar() {
    if (modo === "grupo") {
      const montoGrupo = tipo === "liquidado" ? totalLiquidacion : tipo === "completo" ? totalMontoCompleto : totalCuota;
      onConfirmar({ modo: "grupo", prestamos, tipo: tipo || "completo", monto: montoGrupo, comprobante, fecha: fechaPago });
    } else {
      const monto = tipo === "parcial" ? Number(montoParcial) : tipo === "completo" ? montoCompletoIndividual : montoLiquidacion;
      onConfirmar({ modo: "individual", prestamos, tipo, monto, comprobante, fecha: fechaPago });
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 50 }}>
      <div style={{ background: "var(--surface)", width: "100%", borderRadius: "16px 16px 0 0", padding: 20, maxHeight: "88%", overflowY: "auto" }}>

        {paso === "tipo" && (
          <>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 4 }}>¿Cómo se realizó el pago?</div>
            {modo === "grupo" && (
              <div style={{ ...cardStyle, marginTop: 10, marginBottom: 12 }}>
                {prestamos.map((pr) => (
                  <Row key={pr.id} label={`Préstamo del ${fmtDate(pr.fechaOrigen)}`} value={fmtMoney(pr.cuota)} />
                ))}
                <Row label="Total combinado" value={fmtMoney(totalCuota)} last />
              </div>
            )}
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
              {modo === "grupo" ? "Elige el tipo de pago; aplicará a todos los préstamos de arriba." : `Pago correspondiente a esta fecha: ${fmtMoney(p.cuota)}`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button type="button" onClick={() => elegirTipo("parcial")} style={{ ...btnGhostFull, justifyContent: "flex-start", padding: 14 }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700 }}>Otra cantidad</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>Una cantidad distinta a lo correspondiente a esta fecha (menor o mayor)</div>
                </div>
              </button>
              <button type="button" onClick={() => elegirTipo("completo")} style={{ ...btnGhostFull, justifyContent: "flex-start", padding: 14 }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700 }}>Pago completo</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>La cantidad designada para esta fecha</div>
                </div>
              </button>
              <button type="button" onClick={() => elegirTipo("liquidado")} style={{ ...btnGhostFull, justifyContent: "flex-start", padding: 14 }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700 }}>Liquidación total</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 400 }}>{algunoCongelado ? "Todo el capital pendiente (préstamo congelado, ya sin intereses)" : "Todo lo que se debe: capital e intereses"}</div>
                </div>
              </button>
            </div>
            <button type="button" onClick={onCancelar} style={{ ...btnGhostFull, marginTop: 16 }}>Cancelar</button>
          </>
        )}

        {paso === "grupoParcialInfo" && (
          <>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 12 }}>Otra cantidad</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
              Cada préstamo tiene un saldo distinto, así que una cantidad distinta debe registrarse préstamo por préstamo. Cierra esta ventana y usa el botón "Pagar" junto a cada préstamo en la lista de inicio.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" onClick={volverATipo} style={btnGhostFull}>Atrás</button>
              <button type="button" onClick={onCancelar} style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}>Entendido</button>
            </div>
          </>
        )}

        {paso === "montoParcial" && (
          <>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 12 }}>Otra cantidad</div>
            <Field label="Cantidad que pagó el cliente"><input value={montoParcial} onChange={(e) => setMontoParcial(e.target.value)} type="number" style={inputStyle} placeholder="Ej. 200" /></Field>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 8 }}>Puede ser menor o mayor a lo correspondiente a esta fecha; el sistema ajusta el adeudo automáticamente.</div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              <button type="button" onClick={volverATipo} style={btnGhostFull}>Atrás</button>
              <button type="button" onClick={confirmarMontoParcial} style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}>Confirmar</button>
            </div>
          </>
        )}

        {paso === "confirmarMonto" && tipo === "completo" && (
          <>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 12 }}>Pago completo</div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                {algunoCongelado
                  ? (modo === "grupo" ? "Cuota establecida pendiente de cobro, de los préstamos seleccionados (congelados, sin interés)" : "Cuota establecida pendiente de cobro a la fecha (préstamo congelado, sin interés)")
                  : (modo === "grupo" ? "Interés generado pendiente de pago, de los préstamos seleccionados" : "Interés generado pendiente de pago a la fecha")}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700 }}>{fmtMoney(montoCompletoMostrado)}</div>
            </div>
            {algunoCongelado && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                {montoCompletoMostrado > cuotaReferencia
                  ? `Hay cuotas atrasadas: esta cantidad cubre todo lo atrasado de una sola vez (la cuota regular es ${fmtMoney(cuotaReferencia)}).`
                  : montoCompletoMostrado < cuotaReferencia
                    ? "Ya se había cubierto parte de esta cuota con abonos anteriores; esto es solo el restante para completarla."
                    : "El préstamo está al corriente; esta es la siguiente cuota y se puede cobrar por adelantado."}
              </div>
            )}
            {!algunoCongelado && hayAtraso && (
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8, lineHeight: 1.5 }}>
                Esta cantidad incluye interés de periodos anteriores no cubiertos (la cuota regular es {fmtMoney(cuotaReferencia)}). Cubrir {fmtMoney(montoCompletoMostrado)} deja al cliente al día.
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={confirmarMontoFijo} style={{ ...btnPrimary, justifyContent: "center" }}>Confirmar {fmtMoney(montoCompletoMostrado)}</button>
              <button type="button" onClick={volverATipo} style={btnGhostFull}>No es esta cantidad</button>
            </div>
          </>
        )}

        {paso === "confirmarMonto" && tipo === "liquidado" && (
          <>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 12 }}>Liquidación total</div>
            <div style={cardStyle}>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                {algunoCongelado
                  ? (modo === "grupo" ? "Se debe en total (capital de los préstamos; congelados, ya sin interés)" : "Se debe (capital pendiente; préstamo congelado, ya sin interés)")
                  : (modo === "grupo" ? "Se debe en total (capital + interés de todos los préstamos)" : "Se debe (capital + interés a la fecha)")}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 700 }}>{fmtMoney(montoLiquidacionMostrado)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
              <button type="button" onClick={confirmarMontoFijo} style={{ ...btnPrimary, justifyContent: "center" }}>Confirmar {fmtMoney(montoLiquidacionMostrado)}</button>
              <button type="button" onClick={volverATipo} style={btnGhostFull}>No es esta cantidad</button>
            </div>
          </>
        )}

        {paso === "fecha" && (
          <>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 4 }}>¿Cuándo se realizó el pago?</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>Esto ajusta el registro y, si aplica, el cálculo del interés a esa fecha.</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button type="button" onClick={() => elegirFecha(hoyISO)} style={{ ...btnPrimary, flex: 1, flexDirection: "column", gap: 2, justifyContent: "center", padding: "14px 10px" }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Hoy</span>
                <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>{fmtDate(hoyISO)}</span>
              </button>
              {ayerValido && (
                <button type="button" onClick={() => elegirFecha(ayerISO)} style={{ ...btnPrimary, flex: 1, flexDirection: "column", gap: 2, justifyContent: "center", padding: "14px 10px" }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>Ayer</span>
                  <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.8 }}>{fmtDate(ayerISO)}</span>
                </button>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: mostrarCalendario ? 12 : 4 }}>
              <button type="button" onClick={() => setMostrarCalendario((v) => !v)} style={{ ...btnGhost, justifyContent: "center", padding: "9px 30px", minWidth: 180 }}>Otro día</button>
            </div>
            {mostrarCalendario && (
              <>
                <Field label={`Elige la fecha (entre ${fmtDate(fechaMinima)} y hoy)`}>
                  <div style={{ overflow: "hidden", borderRadius: 8 }}>
                    <input type="date" value={fechaCustom} min={fechaMinima} max={hoyISO} onChange={(e) => setFechaCustom(e.target.value)} style={{ ...inputStyle, height: 40, lineHeight: "20px", display: "block", width: "100%", maxWidth: "100%" }} />
                  </div>
                </Field>
                <button type="button" onClick={() => elegirFecha(fechaCustom)} disabled={!fechaCustom} style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginBottom: 4 }}>Usar {fechaCustom ? fmtDate(fechaCustom) : "esta fecha"}</button>
              </>
            )}
            <div style={{ display: "flex", justifyContent: "flex-start", marginTop: 10 }}>
              <button type="button" onClick={volverATipo} style={btnGhost}>Atrás</button>
            </div>
          </>
        )}

        {paso === "comprobante" && (
          <>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 4 }}>Comprobante de pago</div>
            <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>¿Deseas adjuntar la foto del depósito o transferencia?</div>
            {comprobante && (
              <div style={{ marginBottom: 12 }}>
                {comprobante.tipo.startsWith("image/") ? (
                  <img src={comprobante.dataUrl} alt="comprobante" style={{ width: 90, height: 90, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
                ) : (
                  <div style={{ fontSize: 13, color: "var(--green)" }}>Archivo adjuntado: {comprobante.nombre}</div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button type="button" disabled={subiendo} onClick={() => inputFoto.current && inputFoto.current.click()} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}><Camera size={14} /> Tomar foto</button>
              <button type="button" disabled={subiendo} onClick={() => inputArchivo.current && inputArchivo.current.click()} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}><Upload size={14} /> Subir archivo</button>
            </div>
            {subiendo && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Procesando…</div>}
            <button type="button" onClick={finalizar} style={{ ...btnPrimary, width: "100%", justifyContent: "center", marginTop: 8 }}>{comprobante ? "Guardar pago" : "Continuar sin comprobante"}</button>
            <button type="button" onClick={() => setPaso("fecha")} style={{ ...btnGhostFull, marginTop: 10 }}>Atrás</button>
            <input ref={inputFoto} type="file" accept="image/*" capture="environment" onChange={manejarArchivo} style={{ display: "none" }} />
            <input ref={inputArchivo} type="file" accept="image/*,application/pdf" onChange={manejarArchivo} style={{ display: "none" }} />
          </>
        )}
      </div>
    </div>
  );
}

/* ---------------- reestructuración / congelamiento de préstamo ---------------- */
// Al reestructurar se parte siempre del adeudo real a la fecha (capital + interés
// generado hasta hoy), no del capital original ni de la tasa pactada: desde este punto el
// préstamo queda congelado y no vuelve a generar interés. Permite: 1) agregar o quitar una
// cantidad a ese adeudo, 2) registrar un primer pago inmediato (que se resta del adeudo y
// queda registrado en el historial como un pago), y 3) simular el pago por periodo
// dividiendo la nueva deuda entre el número de meses a pagar.
function ReestructurarModal({ prestamo, onCancelar, onConfirmar }) {
  const hoyISO = toISO(new Date());
  const adeudoActual = calcularAdeudoActualizado(prestamo, hoyISO);

  const [ajusteCapital, setAjusteCapital] = useState("");
  const [darPrimerPago, setDarPrimerPago] = useState(false);
  const [primerPago, setPrimerPago] = useState("");
  const [plazoMeses, setPlazoMeses] = useState("");
  const [auxiliarModo, setAuxiliarModo] = useState(prestamo.auxiliar ? "comision" : "ninguno");
  const [auxiliarPorcentaje, setAuxiliarPorcentaje] = useState(String(prestamo.auxiliar?.porcentaje ?? 0));
  const [auxiliarMontoBono, setAuxiliarMontoBono] = useState("");

  const ajusteNum = Number(ajusteCapital || 0);
  const adeudoConAjuste = Math.max(0, Math.round(adeudoActual + ajusteNum));
  const primerPagoNum = darPrimerPago ? Math.max(0, Math.min(adeudoConAjuste, Number(primerPago || 0))) : 0;
  const nuevaDeuda = Math.max(0, Math.round(adeudoConAjuste - primerPagoNum));
  const plazoNum = Math.max(0, Math.round(Number(plazoMeses || 0)));
  const cuotaCalculada = plazoNum > 0 ? Math.round(nuevaDeuda / plazoNum) : 0;
  const auxiliarBonoAplicaAhora = prestamo.auxiliar && auxiliarModo === "primerPago" && primerPagoNum > 0;
  // Previsión de cuánto le tocaría al auxiliar por el % de comisión que se está
  // capturando, sobre el cobro simulado (la cuota que se calculó arriba, o si aún no se
  // define plazo, la cuota que ya tenía el préstamo).
  const cuotaBaseParaComisionAux = cuotaCalculada > 0 ? cuotaCalculada : Number(prestamo.cuota || 0);
  const auxiliarPorcentajeNum = Math.max(0, Number(auxiliarPorcentaje || 0));
  const auxiliarComisionPreview = Math.round((cuotaBaseParaComisionAux * auxiliarPorcentajeNum) / 100);

  const hayCambios = !prestamo.congelado || ajusteNum !== 0 || primerPagoNum > 0 || plazoNum > 0;

  function confirmar() {
    const nuevaFrecuencia = { tipo: "mensual", mesModo: "origen" };
    const updates = {
      congelado: true,
      congeladoDesde: hoyISO,
      reestructuradoDesde: hoyISO,
      monto: nuevaDeuda,
      capitalPendiente: nuevaDeuda,
      // La tasa se anula: el préstamo queda congelado y ya no debe volver a generar
      // interés bajo ningún supuesto a partir de este punto.
      tasaInteres: 0,
    };
    if (plazoNum > 0) {
      updates.frecuencia = nuevaFrecuencia;
      updates.cuota = cuotaCalculada > 0 ? cuotaCalculada : prestamo.cuota;
      updates.proximoPago = calcularSiguientePago(hoyISO, nuevaFrecuencia, hoyISO, true);
    }

    let auxiliarMontoPagoExtra = 0;
    if (prestamo.auxiliar) {
      if (auxiliarModo === "ninguno") {
        updates.auxiliar = null;
        updates.auxiliarBonoPendiente = 0;
      } else if (auxiliarModo === "comision") {
        updates.auxiliar = { ...prestamo.auxiliar, porcentaje: Math.max(0, Number(auxiliarPorcentaje || 0)) };
        updates.auxiliarBonoPendiente = 0;
        if (primerPagoNum > 0) auxiliarMontoPagoExtra = Math.round((primerPagoNum * Math.max(0, Number(auxiliarPorcentaje || 0))) / 100);
      } else if (auxiliarModo === "primerPago") {
        const bono = Math.max(0, Number(auxiliarMontoBono || 0));
        updates.auxiliar = { ...prestamo.auxiliar, porcentaje: 0 };
        updates.auxiliarBonoPendiente = auxiliarBonoAplicaAhora ? 0 : bono;
        if (auxiliarBonoAplicaAhora) auxiliarMontoPagoExtra = Math.round(Math.min(bono, primerPagoNum));
      }
    }

    const partesNota = [`adeudo a la fecha ${fmtMoney(adeudoActual)}`];
    if (ajusteNum !== 0) partesNota.push(`ajuste al capital ${ajusteNum > 0 ? "+" : ""}${fmtMoney(ajusteNum)}`);
    if (primerPagoNum > 0) partesNota.push(`primer pago ${fmtMoney(primerPagoNum)}`);
    partesNota.push(`nueva deuda ${fmtMoney(nuevaDeuda)}`);
    if (plazoNum > 0) partesNota.push(`a pagar en ${plazoNum} ${plazoNum === 1 ? "mes" : "meses"} · ${fmtMoney(cuotaCalculada)}/mes`);
    partesNota.push("préstamo congelado (ya no genera interés)");
    if (prestamo.auxiliar) {
      if (auxiliarModo === "ninguno") partesNota.push(`${prestamo.auxiliar.nombre} deja de cobrar`);
      else if (auxiliarModo === "comision") partesNota.push(`${prestamo.auxiliar.nombre} seguirá cobrando ${Math.max(0, Number(auxiliarPorcentaje || 0))}% de cada pago`);
      else if (auxiliarModo === "primerPago") partesNota.push(`${prestamo.auxiliar.nombre} recibirá ${fmtMoney(Number(auxiliarMontoBono || 0))} en el primer pago tras el cambio`);
    }
    const nota = `Reestructuración: ${partesNota.join("; ")}.`;

    const pagoExtra = primerPagoNum > 0 ? { monto: primerPagoNum, interesMonto: 0, capitalMonto: primerPagoNum, auxiliarMonto: auxiliarMontoPagoExtra } : null;
    onConfirmar(updates, nota, pagoExtra);
  }

  return (
    <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", zIndex: 50 }}>
      <div style={{ background: "var(--surface)", width: "100%", borderRadius: "16px 16px 0 0", padding: 20, maxHeight: "88%", overflowY: "auto" }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 18, marginBottom: 4 }}>Reestructurar préstamo</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
          Se parte del adeudo real a la fecha. Al aplicar los cambios, la deuda anterior deja de existir: desde hoy el préstamo queda congelado, ya no generará más interés, y solo queda vigente la "nueva deuda" que se calcule aquí.
        </div>

        <div style={{ ...cardStyle, marginBottom: 14 }}>
          <Row label="Adeudo real a la fecha" value={fmtMoney(adeudoActual)} last />
        </div>

        <Field label="Agregar o quitar cantidad al capital (usa negativo para quitar)">
          <input value={ajusteCapital} onChange={(e) => setAjusteCapital(e.target.value)} type="number" style={inputStyle} placeholder="Ej. 500 o -500" />
        </Field>
        {ajusteNum !== 0 && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 14 }}>
            Adeudo con ajuste: <b style={{ color: "var(--gold)" }}>{fmtMoney(adeudoConAjuste)}</b>
          </div>
        )}

        <button
          type="button"
          onClick={() => { setDarPrimerPago((v) => !v); if (darPrimerPago) setPrimerPago(""); }}
          style={{ ...pillBtn, width: "100%", justifyContent: "center", display: "flex", marginBottom: 10, background: darPrimerPago ? "var(--gold)" : "var(--surface2)", color: darPrimerPago ? "#1A130A" : "var(--text)", borderColor: darPrimerPago ? "var(--gold)" : "var(--border)" }}
        >
          {darPrimerPago ? "✓ Dando un primer pago" : "Dar un primer pago"}
        </button>

        {darPrimerPago && (
          <Field label="Monto del primer pago">
            <input value={primerPago} onChange={(e) => setPrimerPago(e.target.value)} type="number" style={inputStyle} placeholder="Ej. 3000" />
          </Field>
        )}

        <div style={{ ...cardStyle, marginTop: 4, marginBottom: 14 }}>
          <Row label="Adeudo" value={fmtMoney(adeudoConAjuste)} />
          {primerPagoNum > 0 && <Row label="Primer pago" value={`- ${fmtMoney(primerPagoNum)}`} />}
          <Row label="Nueva deuda" value={fmtMoney(nuevaDeuda)} last />
        </div>

        <Field label="¿A pagar en cuántos meses?">
          <input value={plazoMeses} onChange={(e) => setPlazoMeses(e.target.value)} type="number" min="1" style={inputStyle} placeholder="Ej. 3" />
        </Field>

        {plazoNum > 0 && (
          <div style={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 14 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700 }}>{fmtMoney(cuotaCalculada)} / mes</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
              Nueva deuda ({fmtMoney(nuevaDeuda)}) ÷ {plazoNum} {plazoNum === 1 ? "mes" : "meses"} · primer cobro simulado: <b style={{ color: "var(--text)" }}>{fmtDate(calcularSiguientePago(hoyISO, { tipo: "mensual", mesModo: "origen" }, hoyISO, true))}</b>
            </div>
          </div>
        )}

        {prestamo.auxiliar && (
          <>
            <Field label={`¿${prestamo.auxiliar.nombre} (prestador auxiliar) seguirá cobrando?`}>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button type="button" onClick={() => setAuxiliarModo("ninguno")} style={{ ...pillBtn, background: auxiliarModo === "ninguno" ? "var(--gold)" : "var(--surface2)", color: auxiliarModo === "ninguno" ? "#1A130A" : "var(--text)", borderColor: auxiliarModo === "ninguno" ? "var(--gold)" : "var(--border)" }}>Ya no cobrará</button>
                <button type="button" onClick={() => setAuxiliarModo("comision")} style={{ ...pillBtn, background: auxiliarModo === "comision" ? "var(--gold)" : "var(--surface2)", color: auxiliarModo === "comision" ? "#1A130A" : "var(--text)", borderColor: auxiliarModo === "comision" ? "var(--gold)" : "var(--border)" }}>Comisión en cada pago</button>
                <button type="button" onClick={() => setAuxiliarModo("primerPago")} style={{ ...pillBtn, background: auxiliarModo === "primerPago" ? "var(--gold)" : "var(--surface2)", color: auxiliarModo === "primerPago" ? "#1A130A" : "var(--text)", borderColor: auxiliarModo === "primerPago" ? "var(--gold)" : "var(--border)" }}>Cantidad módica al primer pago</button>
              </div>
            </Field>

            {auxiliarModo === "comision" && (
              <>
                <Field label="Porcentaje de comisión sobre cada pago que haga el deudor (%)">
                  <input value={auxiliarPorcentaje} onChange={(e) => setAuxiliarPorcentaje(e.target.value)} type="number" style={inputStyle} placeholder="Ej. 10" />
                </Field>
                {auxiliarPorcentajeNum > 0 && cuotaBaseParaComisionAux > 0 && (
                  <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 14 }}>
                    Previsión sobre el cobro simulado: {auxiliarPorcentajeNum}% de {fmtMoney(cuotaBaseParaComisionAux)} = <b style={{ color: "var(--gold)" }}>{fmtMoney(auxiliarComisionPreview)}</b> por pago
                  </div>
                )}
              </>
            )}

            {auxiliarModo === "primerPago" && (
              <>
                <Field label="Cantidad módica para el auxiliar">
                  <input value={auxiliarMontoBono} onChange={(e) => setAuxiliarMontoBono(e.target.value)} type="number" style={inputStyle} placeholder="Ej. 200" />
                </Field>
                <div style={{ fontSize: 12, color: "var(--muted)", marginTop: -8, marginBottom: 14 }}>
                  {auxiliarBonoAplicaAhora
                    ? "Se descontará de este primer pago que estás registrando ahora."
                    : "Se cobrará del próximo pago que registre el deudor, después de aplicar estos cambios."}
                </div>
              </>
            )}
          </>
        )}

        <div style={{ ...cardStyle, marginTop: 4, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>Resumen del préstamo nuevo congelado</div>
          <Row label="Adeudo a la fecha" value={fmtMoney(adeudoActual)} />
          {ajusteNum !== 0 && <Row label="Ajuste al capital" value={`${ajusteNum > 0 ? "+" : ""}${fmtMoney(ajusteNum)}`} />}
          {primerPagoNum > 0 && <Row label="Primer pago" value={fmtMoney(primerPagoNum)} />}
          <Row label="Nueva deuda" value={fmtMoney(nuevaDeuda)} />
          {plazoNum > 0 && <Row label="Plazo" value={`${plazoNum} ${plazoNum === 1 ? "mes" : "meses"} · ${fmtMoney(cuotaCalculada)}/mes`} />}
          <Row label="Estado de intereses" value="Congelado (no genera más interés)" />
          {prestamo.auxiliar && (
            <Row
              label="Prestador auxiliar"
              value={
                auxiliarModo === "ninguno" ? "Ya no cobrará"
                  : auxiliarModo === "comision"
                    ? (cuotaBaseParaComisionAux > 0
                        ? `${auxiliarPorcentajeNum}% en cada pago = ${fmtMoney(auxiliarComisionPreview)}`
                        : `${auxiliarPorcentajeNum}% en cada pago`)
                    : `${fmtMoney(Number(auxiliarMontoBono || 0))} en el primer pago`
              }
              last
            />
          )}
        </div>

        {!hayCambios && (
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, fontStyle: "italic" }}>No hay cambios que aplicar todavía.</div>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancelar} style={btnGhostFull}>Cancelar</button>
          <button type="button" disabled={!hayCambios} onClick={confirmar} style={{ ...btnPrimary, flex: 1, justifyContent: "center", opacity: hayCambios ? 1 : 0.5, cursor: hayCambios ? "pointer" : "default" }}>Aplicar cambios</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- detalle de préstamo ---------------- */

function Detalle({ prestamo, cliente, onVolver, onPagar, onEliminar, onReestructurar, resaltarHistorialId }) {
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [mostrarReestructurar, setMostrarReestructurar] = useState(false);
  const [destinatario, setDestinatario] = useState(prestamo.auxiliar ? null : "cliente");
  const [mostrarDocumentos, setMostrarDocumentos] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [resaltarPago, setResaltarPago] = useState(null);
  const hoyISODetalle = toISO(new Date());
  const estado = estadoDe(prestamo, hoyISODetalle);
  const interesMensual = Math.round((prestamo.monto * prestamo.tasaInteres) / 100);
  const adeudoActualizado = calcularAdeudoActualizado(prestamo, hoyISODetalle);
  const cobroSugeridoCongelado = prestamo.congelado ? cuotaPendienteCongelado(prestamo, hoyISODetalle) : 0;
  const resumenPrestamo = resumenFinancieroPrestamo(prestamo, hoyISODetalle);

  // Si se llegó aquí desde un pago en concreto (p. ej. tocando una fecha en la bitácora de
  // ingresos), abre el historial, hace scroll hasta ese pago y lo resalta 5 segundos.
  useEffect(() => {
    if (!resaltarHistorialId) return;
    setMostrarHistorial(true);
    setResaltarPago(resaltarHistorialId);
    const scrollT = setTimeout(() => {
      document.getElementById(`hist-${resaltarHistorialId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    const clearT = setTimeout(() => setResaltarPago(null), 5000);
    return () => { clearTimeout(scrollT); clearTimeout(clearT); };
  }, [resaltarHistorialId]);

  const [docs, setDocs] = useState(null);
  const [docError, setDocError] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await window.storage.get("docs:" + prestamo.id, false);
        if (vivo) setDocs(res && res.value ? JSON.parse(res.value) : { pagare: [], ine: [], comprobante: [] });
      } catch (e) {
        if (vivo) setDocs({ pagare: [], ine: [], comprobante: [] });
      }
    })();
    return () => { vivo = false; };
  }, [prestamo.id]);

  async function guardarDocs(next) {
    setDocs(next);
    try {
      const res = await window.storage.set("docs:" + prestamo.id, JSON.stringify(next), false);
      if (!res) setDocError("No se pudo guardar el archivo. Intenta con una foto más ligera.");
      else setDocError("");
    } catch (e) {
      setDocError("No se pudo guardar el archivo. Intenta con una foto más ligera.");
    }
  }

  async function agregarArchivo(cat, file) {
    if (!file) return;
    setDocError("");
    try {
      const dataUrl = await fileToDataUrl(file);
      const nuevo = { id: uid(), nombre: file.name || "foto.jpg", tipo: file.type || "image/jpeg", dataUrl, fecha: toISO(new Date()) };
      const next = { ...docs, [cat]: [...(docs[cat] || []), nuevo] };
      guardarDocs(next);
    } catch (e) {
      setDocError("No se pudo procesar el archivo.");
    }
  }

  function eliminarArchivo(cat, id) {
    const next = { ...docs, [cat]: docs[cat].filter((d) => d.id !== id) };
    guardarDocs(next);
  }

  const nombreClienteCorto = cliente.nombre.split(" ")[0];
  const nombreAuxCorto = prestamo.auxiliar ? prestamo.auxiliar.nombre.split(" ")[0] : "";
  const mensajeCliente = mensajeRecordatorio(cliente, prestamo);
  const mensajeAux = prestamo.auxiliar ? mensajeRecordatorioAuxiliar(cliente, prestamo) : "";
  const mensajeActual = destinatario === "auxiliar" ? mensajeAux : mensajeCliente;
  const telefonoActual = destinatario === "auxiliar" && prestamo.auxiliar ? prestamo.auxiliar.telefono : cliente.telefono;
  const nombreActual = destinatario === "auxiliar" ? nombreAuxCorto : nombreClienteCorto;
  const tituloRecordatorio = destinatario === "cliente" ? "Recordatorio para el cliente" : destinatario === "auxiliar" ? "Recordatorio para el auxiliar" : "Recordatorios";

  async function copiarMensaje() {
    try {
      await navigator.clipboard.writeText(mensajeActual);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (e) { /* portapapeles no disponible */ }
  }

  const TIPO_LABEL = { parcial: "Otra cantidad", completo: "Pago", liquidado: "Liquidación", reestructuracion: "Reestructuración" };

  return (
    <div style={{ padding: "16px 16px 24px" }}>
      <button onClick={onVolver} style={{ ...btnGhost, marginBottom: 14, padding: "6px 10px" }}><ChevronLeft size={16} /> Volver</button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 22 }}>{cliente.nombre}</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 4, display: "flex", alignItems: "center", gap: 6 }}><Phone size={13} /> {cliente.telefono}</div>
          {cliente.trabajo && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}><Briefcase size={13} /> {cliente.trabajo}</div>}
          {cliente.domicilio && <div style={{ color: "var(--muted)", fontSize: 13, marginTop: 2, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={13} /> {cliente.domicilio}</div>}
          <TransferenciaBadge transferencia={prestamo.transferencia} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
          {prestamo.congelado && !prestamo.liquidado && <CongeladoBadge />}
          <Stamp estado={estado} />
        </div>
      </div>

      <div style={{ ...cardStyle, marginTop: 18, ...prestamoGlowStyle(prestamo, hoyISODetalle) }}>
        <Row label="Préstamo (capital)" value={fmtMoney(prestamo.monto)} />
        {!prestamo.liquidado && <Row label="Adeudo actualizado" value={fmtMoney(adeudoActualizado)} />}
        {!prestamo.congelado && <Row label="Interés mensual" value={`${prestamo.tasaInteres}% (${fmtMoney(interesMensual)})`} />}
        <Row label="Pago por periodo" value={fmtMoney(prestamo.cuota)} />
        <Row label="Frecuencia" value={descripcionFrecuencia(prestamo.frecuencia)} />
        <Row label="Fecha del préstamo" value={fmtDate(prestamo.fechaOrigen)} />
        {prestamo.congelado && !prestamo.liquidado && (
          <Row label="Cobro sugerido ahora" value={`${fmtMoney(cobroSugeridoCongelado)} ${estado === "atrasado" ? "(atrasado)" : "(al día, se puede cobrar por adelantado)"}`} />
        )}
        {!prestamo.liquidado && <Row label="% recuperado del préstamo" value={`${resumenPrestamo.pctRecuperado}%`} />}
        {!prestamo.liquidado && <Row label="Ganancia después de comisiones" value={fmtMoney(resumenPrestamo.gananciaDespuesComisiones)} />}
        <Row label="Estado" value={prestamo.liquidado ? "Préstamo liquidado" : `Próximo pago: ${fmtDate(prestamo.proximoPago)}`} last={!prestamo.auxiliar} />
        {prestamo.auxiliar && (
          <Row label={`Auxiliar: ${prestamo.auxiliar.nombre}`} value={`${prestamo.auxiliar.porcentaje}% → ${fmtMoney(Math.round((prestamo.cuota * prestamo.auxiliar.porcentaje) / 100))}`} last={!(prestamo.auxiliarBonoPendiente > 0)} />
        )}
        {prestamo.auxiliarBonoPendiente > 0 && (
          <Row label="Bono pendiente para el auxiliar" value={`${fmtMoney(prestamo.auxiliarBonoPendiente)} (en el próximo pago)`} last />
        )}
      </div>

      {prestamo.liquidado && (
        <div style={{ ...cardStyle, marginTop: 10, border: "1px solid var(--gold)", display: "flex", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>% recuperado (final)</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--gold)" }}>{resumenPrestamo.pctRecuperado}%</div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>Ganancia neta</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: resumenPrestamo.gananciaDespuesComisiones < 0 ? "var(--red)" : "var(--green)" }}>{fmtMoney(resumenPrestamo.gananciaDespuesComisiones)}</div>
          </div>
        </div>
      )}

      {!prestamo.liquidado && (
        <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={onPagar} style={{ ...btnPrimary, flex: 1, justifyContent: "center" }}><Check size={16} /> Marcar pagado</button>
          {!prestamo.congelado && (
            <button
              type="button"
              onClick={() => setMostrarReestructurar(true)}
              style={{ ...btnGhostFull, flex: 1, justifyContent: "center" }}
            >
              Congelar préstamo
            </button>
          )}
        </div>
      )}

      {!prestamo.liquidado && (
        <div style={{ ...cardStyle, marginTop: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{tituloRecordatorio}</div>
          {prestamo.auxiliar && (
            <div style={{ display: "flex", gap: 8, marginBottom: destinatario ? 12 : 0, flexWrap: "wrap" }}>
              <button type="button" onClick={() => setDestinatario("cliente")} style={{ ...pillBtn, flex: 1, background: destinatario === "cliente" ? "var(--gold)" : "var(--surface2)", color: destinatario === "cliente" ? "#1A130A" : "var(--text)", borderColor: destinatario === "cliente" ? "var(--gold)" : "var(--border)" }}>Cliente</button>
              <button type="button" onClick={() => setDestinatario("auxiliar")} style={{ ...pillBtn, flex: 1, background: destinatario === "auxiliar" ? "var(--gold)" : "var(--surface2)", color: destinatario === "auxiliar" ? "#1A130A" : "var(--text)", borderColor: destinatario === "auxiliar" ? "var(--gold)" : "var(--border)" }}>{prestamo.auxiliar.nombre}</button>
            </div>
          )}
          {destinatario && (
            <>
              <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 10, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{mensajeActual}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <a href={waLink(telefonoActual, mensajeActual)} target="_blank" rel="noopener noreferrer" style={{ ...btnWhatsapp, background: "var(--gold)", color: "#1A130A" }}><MessageCircle size={15} /> Enviar a {nombreActual}</a>
                <button type="button" onClick={copiarMensaje} style={btnGhost}>{copiado ? "¡Copiado!" : "Copiar mensaje"}</button>
              </div>
            </>
          )}
        </div>
      )}

      <div style={{ marginTop: 26 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
          onClick={() => setMostrarDocumentos((v) => !v)}
        >
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Documentos{docs !== null ? ` (${DOC_CATS.reduce((s, cat) => s + (docs[cat.key] || []).length, 0)})` : ""}
          </div>
          {mostrarDocumentos ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
        </div>
        {mostrarDocumentos && (
          <div style={{ marginTop: 10 }}>
            {docs === null && <div style={{ color: "var(--muted)", fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}><Loader2 size={14} /> Cargando documentos…</div>}
            {docError && <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 8 }}>{docError}</div>}
            {docs !== null && DOC_CATS.map((cat) => (
              <DocumentSection key={cat.key} titulo={cat.label} archivos={docs[cat.key] || []} onAdd={(f) => agregarArchivo(cat.key, f)} onDelete={(id) => eliminarArchivo(cat.key, id)} />
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 26 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }}
          onClick={() => setMostrarHistorial((v) => !v)}
        >
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em" }}>Historial de pagos ({prestamo.historial.length})</div>
          {mostrarHistorial ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
        </div>
        {mostrarHistorial && (
          <div style={{ marginTop: 10 }}>
            {prestamo.historial.length === 0 && <div style={{ color: "var(--muted)", fontSize: 13, fontStyle: "italic" }}>Sin pagos registrados todavía.</div>}
            {resumenPrestamo.numPagos > 0 && (
              <div style={{ ...cardStyle, background: "var(--surface2)", marginBottom: 10 }}>
                <Row label="Total de pagos hechos" value={`${resumenPrestamo.numPagos} · ${fmtMoney(resumenPrestamo.totalPagado)}`} last={!prestamo.auxiliar} />
                {prestamo.auxiliar && <Row label={`Recibido por ${prestamo.auxiliar.nombre}`} value={fmtMoney(resumenPrestamo.totalAuxiliar)} />}
                {prestamo.auxiliar && <Row label="Recibido después de comisiones" value={fmtMoney(resumenPrestamo.recibidoDespuesComisiones)} last />}
              </div>
            )}
            {[...prestamo.historial].reverse().map((h, i) => (
              <div
                key={h.id || i}
                id={h.id ? `hist-${h.id}` : undefined}
                style={{
                  padding: "8px 10px",
                  margin: "0 -10px",
                  borderRadius: 8,
                  borderBottom: "1px solid var(--border)",
                  transition: "background-color 1s ease, box-shadow 1s ease",
                  background: resaltarPago && h.id === resaltarPago ? "rgba(230,180,60,0.18)" : "transparent",
                  boxShadow: resaltarPago && h.id === resaltarPago ? "0 0 0 1px var(--gold) inset" : "none",
                }}
              >
                {h.tipo === "reestructuracion" ? (
                  <div style={{ fontSize: 13 }}>
                    <div style={{ color: "var(--gold)", fontWeight: 600 }}>{TIPO_LABEL.reestructuracion} el {fmtDate(h.fecha)}</div>
                    {h.nota && <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 3, lineHeight: 1.5 }}>{h.nota}</div>}
                  </div>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                      <span style={{ color: "var(--muted)" }}>
                        {TIPO_LABEL[h.tipo] || "Pago"} el {fmtDate(h.fecha)}{h.auxiliarMonto > 0 ? ` · auxiliar: ${fmtMoney(h.auxiliarMonto)}` : ""}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)" }}>{fmtMoney(h.monto)}</span>
                    </div>
                    {h.comprobante && (
                      <div style={{ marginTop: 6 }}>
                        {h.comprobante.tipo && h.comprobante.tipo.startsWith("image/") ? (
                          <img src={h.comprobante.dataUrl} alt="comprobante" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 6, border: "1px solid var(--border)" }} />
                        ) : (
                          <span style={{ fontSize: 12, color: "var(--green)" }}>Comprobante adjunto</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {mostrarReestructurar && (
        <ReestructurarModal
          prestamo={prestamo}
          onCancelar={() => setMostrarReestructurar(false)}
          onConfirmar={(updates, nota, pagoExtra) => { onReestructurar(prestamo.id, updates, nota, pagoExtra); setMostrarReestructurar(false); }}
        />
      )}

      <div style={{ marginTop: 30, display: "flex", flexDirection: "column", gap: 10 }}>
        {!confirmando ? (
          <button onClick={() => setConfirmando(true)} style={{ ...btnGhostFull, color: "var(--red)", borderColor: "var(--red)" }}><Trash2 size={15} /> Eliminar préstamo</button>
        ) : (
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setConfirmando(false)} style={btnGhostFull}><X size={15} /> Cancelar</button>
            <button onClick={onEliminar} style={{ ...btnGhostFull, flex: 1, background: "var(--red)", color: "#1A0E0C", borderColor: "var(--red)" }}>Sí, eliminar</button>
          </div>
        )}
      </div>
    </div>
  );
}

function DocumentSection({ titulo, archivos, onAdd, onDelete }) {
  const inputFoto = useRef(null);
  const inputArchivo = useRef(null);
  const [subiendo, setSubiendo] = useState(false);

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setSubiendo(true);
    await onAdd(file);
    setSubiendo(false);
  }

  return (
    <div style={{ ...cardStyle, marginBottom: 10 }}>
      <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{titulo}</div>

      {archivos.length > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {archivos.map((a) => (
            <div key={a.id} style={{ position: "relative", width: 72, height: 72 }}>
              {a.tipo && a.tipo.startsWith("image/") ? (
                <img src={a.dataUrl} alt={a.nombre} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }} />
              ) : (
                <div style={{ width: 72, height: 72, borderRadius: 8, border: "1px solid var(--border)", background: "var(--surface2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <FileText size={22} color="var(--muted)" />
                </div>
              )}
              <button onClick={() => onDelete(a.id)} style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: "var(--red)", border: "none", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" disabled={subiendo} onClick={() => inputFoto.current && inputFoto.current.click()} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}>
          <Camera size={14} /> Tomar foto
        </button>
        <button type="button" disabled={subiendo} onClick={() => inputArchivo.current && inputArchivo.current.click()} style={{ ...btnGhost, flex: 1, justifyContent: "center" }}>
          <Upload size={14} /> Subir archivo
        </button>
      </div>
      {subiendo && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>Guardando…</div>}

      <input ref={inputFoto} type="file" accept="image/*" capture="environment" onChange={handleFile} style={{ display: "none" }} />
      <input ref={inputArchivo} type="file" accept="image/*,application/pdf" onChange={handleFile} style={{ display: "none" }} />
    </div>
  );
}

function Row({ label, value, last, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: last ? "none" : "1px solid var(--border)", gap: 10, cursor: onClick ? "pointer" : "default" }}
    >
      <span style={{ color: onClick ? "var(--gold)" : "var(--muted)", fontSize: 13, textDecoration: onClick ? "underline" : "none" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 600, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: 14, ...style }}>
      <label style={{ display: "block", fontSize: 12, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</label>
      {children}
    </div>
  );
}

// Campo de teléfono con botón para buscar directamente entre los contactos
// del teléfono (Contact Picker API). Solo Chrome/Android la soportan por
// ahora; si el navegador no la tiene, el botón simplemente no aparece y el
// campo funciona como siempre (escribir el número a mano).
function soportaSelectorContactos() {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.contacts &&
    typeof navigator.contacts.select === "function"
  );
}

function CampoTelefono({ label, value, onChange, onNombreDetectado, placeholder }) {
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState("");
  const soportado = soportaSelectorContactos();

  async function elegirDeContactos() {
    setAviso("");
    setBuscando(true);
    try {
      const seleccion = await navigator.contacts.select(["name", "tel"], { multiple: false });
      const contacto = seleccion && seleccion[0];
      if (contacto) {
        const telCrudo = (contacto.tel && contacto.tel[0]) || "";
        const digitos = telCrudo.replace(/\D/g, "").slice(-10);
        if (digitos.length === 10) {
          onChange(digitos);
        } else {
          setAviso("Ese contacto no tiene un número de 10 dígitos válido.");
        }
        const nombre = (contacto.name && contacto.name[0]) || "";
        if (nombre && onNombreDetectado) onNombreDetectado(nombre);
      }
    } catch (e) {
      // El usuario cerró el selector, o el navegador negó el permiso: no hay
      // nada que mostrar como error, simplemente no se llenó el campo.
    } finally {
      setBuscando(false);
    }
  }

  return (
    <Field label={label}>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 10))}
          style={{ ...inputStyle, flex: 1 }}
          placeholder={placeholder}
          inputMode="numeric"
          autoComplete="off"
        />
        {soportado && (
          <button
            type="button"
            onClick={elegirDeContactos}
            disabled={buscando}
            title="Buscar en contactos del teléfono"
            style={{ ...btnGhost, padding: "0 12px", flexShrink: 0, opacity: buscando ? 0.6 : 1 }}
          >
            {buscando ? <Loader2 size={16} /> : <Contact size={16} />}
          </button>
        )}
      </div>
      {aviso && <div style={{ fontSize: 12, color: "var(--red)", marginTop: 4 }}>{aviso}</div>}
    </Field>
  );
}

/* ---------------- libro de préstamos ---------------- */

function Libro({ prestamos, clientes, onVerPrestamo }) {
  const [modo, setModo] = useState("general");
  const [auxiliarKey, setAuxiliarKey] = useState("");

  const auxMap = {};
  prestamos.forEach((p) => {
    if (p.auxiliar && p.auxiliar.nombre) {
      const key = p.auxiliar.nombre + "|" + (p.auxiliar.telefono || "");
      if (!auxMap[key]) auxMap[key] = { nombre: p.auxiliar.nombre, telefono: p.auxiliar.telefono, key };
    }
  });
  const auxiliares = Object.values(auxMap);

  const prestamosFiltrados = modo === "general"
    ? prestamos
    : auxiliarKey
      ? prestamos.filter((p) => p.auxiliar && (p.auxiliar.nombre + "|" + (p.auxiliar.telefono || "")) === auxiliarKey)
      : prestamos.filter((p) => p.auxiliar && p.auxiliar.nombre);

  return (
    <div style={{ padding: "16px 16px 24px" }}>
      <div style={{ fontFamily: "var(--font-display)", fontSize: 19, marginBottom: 14 }}>Libro de préstamos</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setModo("general")} style={{ ...pillBtn, flex: 1, background: modo === "general" ? "var(--gold)" : "var(--surface2)", color: modo === "general" ? "#1A130A" : "var(--text)", borderColor: modo === "general" ? "var(--gold)" : "var(--border)" }}>Mi libro</button>
        <button type="button" onClick={() => setModo("auxiliares")} style={{ ...pillBtn, flex: 1, background: modo === "auxiliares" ? "var(--gold)" : "var(--surface2)", color: modo === "auxiliares" ? "#1A130A" : "var(--text)", borderColor: modo === "auxiliares" ? "var(--gold)" : "var(--border)" }}>Prestadores auxiliares</button>
      </div>

      {modo === "auxiliares" && (
        <>
          {auxiliares.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14, marginBottom: 14 }}>Aún no hay préstamos con un prestador auxiliar asignado.</div>}
          {auxiliares.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <button type="button" onClick={() => setAuxiliarKey("")} style={{ ...pillBtn, background: !auxiliarKey ? "var(--gold)" : "var(--surface2)", color: !auxiliarKey ? "#1A130A" : "var(--text)", borderColor: !auxiliarKey ? "var(--gold)" : "var(--border)" }}>Todos</button>
              {auxiliares.map((a) => (
                <button key={a.key} type="button" onClick={() => setAuxiliarKey(a.key)} style={{ ...pillBtn, background: auxiliarKey === a.key ? "var(--gold)" : "var(--surface2)", color: auxiliarKey === a.key ? "#1A130A" : "var(--text)", borderColor: auxiliarKey === a.key ? "var(--gold)" : "var(--border)" }}>{a.nombre}</button>
              ))}
            </div>
          )}
        </>
      )}

      {modo === "auxiliares" && !auxiliarKey && auxiliares.length > 0 && (
        <DesgloseAuxiliares prestamos={prestamos} auxiliares={auxiliares} />
      )}

      {(modo === "general" || auxiliares.length > 0) && (
        <LibroStats prestamos={prestamosFiltrados} esAuxiliar={modo === "auxiliares"} clientes={clientes} onVerPrestamo={onVerPrestamo} />
      )}
    </div>
  );
}

// Desglose individual: para cada prestador auxiliar, cuánto ha generado en comisiones y
// cuál es la ganancia (del dueño del dinero) después de restar esa comisión, considerando
// únicamente los préstamos que ese auxiliar tiene asignados.
function DesgloseAuxiliares({ prestamos, auxiliares }) {
  const hoyISO = toISO(new Date());
  const [abiertos, setAbiertos] = useState({});
  const toggle = (key) => setAbiertos((prev) => ({ ...prev, [key]: !prev[key] }));
  const filas = auxiliares.map((a) => {
    const prestamosAux = prestamos.filter((p) => p.auxiliar && (p.auxiliar.nombre + "|" + (p.auxiliar.telefono || "")) === a.key);
    const prestado = prestamosAux.reduce((s, p) => s + montoOriginalDe(p), 0);
    let ingresos = 0, comision = 0, gananciaDespuesComisiones = 0, totalEsperado = 0, totalRecuperado = 0;
    prestamosAux.forEach((p) => {
      p.historial.forEach((h) => {
        ingresos += Number(h.monto || 0);
        comision += Number(h.auxiliarMonto || 0);
      });
      const r = resumenFinancieroPrestamo(p, hoyISO);
      gananciaDespuesComisiones += r.gananciaDespuesComisiones;
      totalEsperado += r.totalEsperado;
      totalRecuperado += r.totalRecuperado;
    });
    const pctRecuperado = totalEsperado > 0 ? Math.round((totalRecuperado / totalEsperado) * 100) : 0;
    const congeladosAux = prestamosAux.filter((p) => p.congelado && !p.liquidado);
    const capitalCongeladoAux = congeladosAux.reduce((s, p) => s + Math.max(0, Number(p.capitalPendiente == null ? p.monto : p.capitalPendiente)), 0);
    return { key: a.key, nombre: a.nombre, prestamos: prestamosAux.length, prestado, ingresos, comision, gananciaDespuesComisiones, pctRecuperado, congelados: congeladosAux.length, capitalCongeladoAux };
  });

  const totalComision = filas.reduce((s, f) => s + f.comision, 0);
  const totalGananciaDespues = filas.reduce((s, f) => s + f.gananciaDespuesComisiones, 0);

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Ganancia después de comisiones · por auxiliar</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
        <StatCard label="Comisiones (todos)" value={fmtMoney(totalComision)} color="var(--gold)" />
        <StatCard label="Ganancia después de comisiones (todos)" value={fmtMoney(totalGananciaDespues)} color={totalGananciaDespues < 0 ? "var(--red)" : "var(--green)"} />
      </div>
      {filas.map((f) => {
        const abierto = !!abiertos[f.key];
        return (
          <div key={f.key} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggle(f.key)}>
              <div style={{ fontWeight: 600, fontSize: 14 }}>{f.nombre}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{f.prestamos} préstamo(s) · {f.pctRecuperado}% recuperado</div>
                {abierto ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
              </div>
            </div>
            {abierto && (
              <div style={{ marginTop: 8 }}>
                <Row label="Préstamos asignados" value={String(f.prestamos)} />
                <Row label="Dinero prestado" value={fmtMoney(f.prestado)} />
                <Row label="Ingresos generados" value={fmtMoney(f.ingresos)} />
                <Row label="Comisión del auxiliar" value={fmtMoney(f.comision)} />
                <Row label="Ganancia después de comisiones" value={fmtMoney(f.gananciaDespuesComisiones)} />
                <Row label="% de cartera recuperada" value={`${f.pctRecuperado}%`} last={f.congelados === 0} />
                {f.congelados > 0 && <Row label="Préstamos congelados" value={`${f.congelados} · ${fmtMoney(f.capitalCongeladoAux)}`} last />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Cartera por mes de originación ("cosechas"): agrupa los préstamos por el mes en que
// se otorgaron (no por el mes de los pagos) para medir desempeño histórico de cada
// generación de préstamos. La ganancia y el % recuperado de cada préstamo se calculan con
// resumenFinancieroPrestamo -la MISMA función que usa el detalle de cada préstamo-, y aquí
// solo se suman por cosecha, para que las cifras siempre cuadren entre ambas pantallas
// (incluyendo préstamos congelados, que siguen generando ganancia real después de
// congelarse conforme el cliente va pagando la nueva deuda pactada).
function BitacoraPorMesOriginacion({ prestamos }) {
  const hoyISO = toISO(new Date());
  const [abiertos, setAbiertos] = useState({});
  const cosechas = {};
  prestamos.forEach((p) => {
    const key = p.fechaOrigen.slice(0, 7);
    if (!cosechas[key]) {
      cosechas[key] = {
        key, prestamos: 0, capitalSalido: 0,
        liquidados: 0, liquidadosCapital: 0,
        activos: 0, activosDeuda: 0,
        gananciaDespuesComisiones: 0, totalEsperado: 0, totalRecuperado: 0,
      };
    }
    const c = cosechas[key];
    const r = resumenFinancieroPrestamo(p, hoyISO);
    c.prestamos++;
    c.capitalSalido += montoOriginalDe(p);
    if (p.liquidado) { c.liquidados++; c.liquidadosCapital += montoOriginalDe(p); }
    else { c.activos++; c.activosDeuda += calcularAdeudoActualizado(p, hoyISO); }
    c.gananciaDespuesComisiones += r.gananciaDespuesComisiones;
    c.totalEsperado += r.totalEsperado;
    c.totalRecuperado += r.totalRecuperado;
  });

  const claves = Object.keys(cosechas).sort().reverse();
  const toggle = (key) => setAbiertos((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div>
      <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
        Cada ficha agrupa los préstamos según el mes en que se otorgaron, para comparar el desempeño de cada generación de préstamos a lo largo del tiempo. Toca un mes para ver el detalle.
      </div>
      {claves.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>Aún no hay préstamos registrados.</div>}
      {claves.map((key) => {
        const c = cosechas[key];
        const pctRecuperado = c.totalEsperado > 0 ? Math.round((c.totalRecuperado / c.totalEsperado) * 100) : 0;
        // % de ganancia: ganancia real a la fecha vs. capital otorgado en ese mes.
        // Ej. otorgado $1,000 -> ganancia real $2,000 = 200%.
        const pctGanancia = c.capitalSalido > 0 ? Math.round((c.gananciaDespuesComisiones / c.capitalSalido) * 100) : 0;
        const abierto = !!abiertos[key];
        return (
          <div key={key} style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggle(key)}>
              <div style={{ fontWeight: 600, fontSize: 14, textTransform: "capitalize" }}>{monthLabel(key)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>{c.prestamos} préstamo(s) · {pctRecuperado}%</div>
                {abierto ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
              </div>
            </div>
            {abierto && (
              <div style={{ marginTop: 8 }}>
                <Row label="Préstamos otorgados" value={`${c.prestamos} · ${fmtMoney(c.capitalSalido)}`} />
                <Row label="Activos" value={`${c.activos} · ${fmtMoney(c.activosDeuda)}`} />
                <Row label="Liquidados" value={`${c.liquidados} · ${fmtMoney(c.liquidadosCapital)}`} />
                <Row label="Ganancia real a la fecha" value={`${fmtMoney(c.gananciaDespuesComisiones)} · ${pctGanancia}% de ganancia`} />
                <Row label="% de esa cartera recuperado" value={`${pctRecuperado}%`} last />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LibroStats({ prestamos, esAuxiliar, clientes, onVerPrestamo }) {
  const [anio, setAnio] = useState("todos");
  const hoyISO = toISO(new Date());

  const [mesesAbiertos, setMesesAbiertos] = useState({});
  const toggleMes = (key) => setMesesAbiertos((prev) => ({ ...prev, [key]: !prev[key] }));
  const [vistaBitacora, setVistaBitacora] = useState("ingresos");

  const aniosSet = new Set();
  prestamos.forEach((p) => {
    aniosSet.add(p.fechaOrigen.slice(0, 4));
    p.historial.forEach((h) => aniosSet.add(h.fecha.slice(0, 4)));
  });
  const anios = Array.from(aniosSet).sort();

  const prestamosDelAnio = anio === "todos" ? prestamos : prestamos.filter((p) => p.fechaOrigen.slice(0, 4) === anio);
  const prestadoPeriodo = prestamosDelAnio.reduce((s, p) => s + montoOriginalDe(p), 0);
  const saldadosPeriodo = prestamosDelAnio.filter((p) => p.liquidado).length;

  // "Ingresos" = TODO el dinero que entró por pagos en el periodo, sin importar si es
  // capital o interés. "Comisiones" = lo pagado/ganado por el prestador auxiliar sobre
  // esos pagos (se descuenta para calcular la ganancia después de comisiones).
  let comisionesPeriodo = 0, pagosMontoPeriodo = 0;
  prestamos.forEach((p) => {
    p.historial.forEach((h) => {
      if (anio === "todos" || h.fecha.slice(0, 4) === anio) {
        pagosMontoPeriodo += Number(h.monto || 0);
        comisionesPeriodo += Number(h.auxiliarMonto || 0);
      }
    });
  });
  const ingresosPeriodo = pagosMontoPeriodo;
  const gananciaMostrada = esAuxiliar ? comisionesPeriodo : ingresosPeriodo;

  // "Ganancia" = ingresos del periodo (todo lo que entró) menos el dinero prestado en el
  // periodo (lo que salió al otorgar préstamos). "Ganancia después de comisiones" resta
  // además lo que corresponde al prestador auxiliar, cuando aplica.
  const gananciaPeriodo = ingresosPeriodo - prestadoPeriodo;
  const gananciaDespuesComisionesPeriodo = gananciaPeriodo - comisionesPeriodo;
  // % de ganancia después de comisiones respecto al dinero prestado en el periodo.
  const pctGananciaDespuesComisiones = prestadoPeriodo > 0 ? Math.round((gananciaDespuesComisionesPeriodo / prestadoPeriodo) * 100) : 0;

  // "% de cartera recuperada" = de todo lo que los préstamos del periodo deberían haber
  // entregado hasta hoy, cuánto ya se recuperó. Usa resumenFinancieroPrestamo -la misma
  // función que el detalle de cada préstamo- para que un préstamo congelado siga sumando
  // lo recuperado después de congelarse.
  let totalEsperadoPeriodo = 0, totalRecuperadoPeriodo = 0;
  prestamosDelAnio.forEach((p) => {
    const r = resumenFinancieroPrestamo(p, hoyISO);
    totalEsperadoPeriodo += r.totalEsperado;
    totalRecuperadoPeriodo += r.totalRecuperado;
  });
  const pctCarteraRecuperada = totalEsperadoPeriodo > 0 ? Math.round((totalRecuperadoPeriodo / totalEsperadoPeriodo) * 100) : 0;

  // Préstamos congelados (reestructurados a cuota fija, sin interés) que siguen con
  // capital pendiente por cobrar, dentro del periodo seleccionado.
  const congeladosPeriodo = prestamosDelAnio.filter((p) => p.congelado && !p.liquidado);
  const capitalCongeladoPendiente = congeladosPeriodo.reduce((s, p) => s + Math.max(0, Number(p.capitalPendiente == null ? p.monto : p.capitalPendiente)), 0);

  const meses = {};
  const nuevoMes = () => ({ prestamos: 0, monto: 0, ingresos: 0, comision: 0, pagos: 0, saldados: 0, pendientes: 0, listaPendientes: [], pagosPorCliente: {} });
  prestamos.forEach((p) => {
    if (anio === "todos" || p.fechaOrigen.slice(0, 4) === anio) {
      const key = p.fechaOrigen.slice(0, 7);
      if (!meses[key]) meses[key] = nuevoMes();
      meses[key].prestamos++;
      meses[key].monto += Number(p.monto || 0);
      if (p.liquidado) meses[key].saldados++; else { meses[key].pendientes++; meses[key].listaPendientes.push(p); }
    }
    const cliente = clientes ? clientes.find((c) => c.id === p.clienteId) : null;
    const nombreCliente = cliente ? cliente.nombre : "Cliente";
    p.historial.forEach((h) => {
      if (anio === "todos" || h.fecha.slice(0, 4) === anio) {
        const hkey = h.fecha.slice(0, 7);
        if (!meses[hkey]) meses[hkey] = nuevoMes();
        meses[hkey].pagos++;
        meses[hkey].ingresos += Number(h.monto || 0);
        meses[hkey].comision += Number(h.auxiliarMonto || 0);
        // Desglose por cliente: si la misma persona pagó varias veces en el mes, se
        // suman sus abonos en una sola fila y se conservan todas las fechas en que pagó.
        if (!meses[hkey].pagosPorCliente[p.clienteId]) meses[hkey].pagosPorCliente[p.clienteId] = { nombre: nombreCliente, monto: 0, fechas: [] };
        meses[hkey].pagosPorCliente[p.clienteId].monto += Number(h.monto || 0);
        meses[hkey].pagosPorCliente[p.clienteId].fechas.push({ fecha: h.fecha, prestamoId: p.id, historialId: h.id });
      }
    });
  });
  // En "Mi libro" (no auxiliares) solo interesa ver los meses en los que de verdad entró
  // dinero; en la vista de auxiliares se conservan todos para no perder contexto de comisión.
  const mesesOrdenados = Object.keys(meses).sort().reverse().filter((key) => esAuxiliar || meses[key].ingresos > 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <button type="button" onClick={() => setAnio("todos")} style={{ ...pillBtn, padding: "6px 12px", fontSize: 12, background: anio === "todos" ? "var(--gold)" : "var(--surface2)", color: anio === "todos" ? "#1A130A" : "var(--text)", borderColor: anio === "todos" ? "var(--gold)" : "var(--border)" }}>Todos</button>
        {anios.map((a) => (
          <button key={a} type="button" onClick={() => setAnio(a)} style={{ ...pillBtn, padding: "6px 12px", fontSize: 12, background: anio === a ? "var(--gold)" : "var(--surface2)", color: anio === a ? "#1A130A" : "var(--text)", borderColor: anio === a ? "var(--gold)" : "var(--border)" }}>{a}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        <StatCard wide label="Préstamos otorgados" value={`${prestamosDelAnio.length} préstamo(s) · ${fmtMoney(prestadoPeriodo)} prestados`} sub="Cantidad de préstamos y dinero prestado en el periodo" />
        <StatCard label={esAuxiliar ? "Comisiones ganadas" : "Ingresos"} value={fmtMoney(gananciaMostrada)} color="var(--gold)" sub={esAuxiliar ? undefined : "Capital + interés recibidos"} />
        <StatCard label="Préstamos saldados" value={String(saldadosPeriodo)} sub="Préstamos completamente liquidados en el periodo" />
        <StatCard label="Préstamos congelados" value={`${congeladosPeriodo.length} · ${fmtMoney(capitalCongeladoPendiente)}`} color={congeladosPeriodo.length > 0 ? "var(--gold)" : undefined} sub="Préstamos reestructurados a cuota fija (sin interés) con capital aún pendiente, y ese capital pendiente" />
      </div>

      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Ganancias</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 18 }}>
        <StatCard label="Ganancia" value={fmtMoney(gananciaPeriodo)} color={gananciaPeriodo < 0 ? "var(--red)" : "var(--green)"} sub="Ingresos − dinero prestado" />
        <StatCard label="% de cartera recuperada" value={`${pctCarteraRecuperada}%`} color="var(--gold)" sub="Capital + interés cobrado vs. generado" />
        <StatCard wide label="Ganancia después de comisiones" value={`${fmtMoney(gananciaDespuesComisionesPeriodo)} · ${pctGananciaDespuesComisiones}%`} color={gananciaDespuesComisionesPeriodo < 0 ? "var(--red)" : "var(--green)"} sub="Ganancia − comisión de auxiliar, y ese monto como % del dinero prestado" />
      </div>

      {!esAuxiliar && (
        <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setVistaBitacora("ingresos")} style={{ ...pillBtn, flex: 1, background: vistaBitacora === "ingresos" ? "var(--gold)" : "var(--surface2)", color: vistaBitacora === "ingresos" ? "#1A130A" : "var(--text)", borderColor: vistaBitacora === "ingresos" ? "var(--gold)" : "var(--border)" }}>Bitácora de ingresos mensual</button>
          <button type="button" onClick={() => setVistaBitacora("originacion")} style={{ ...pillBtn, flex: 1, background: vistaBitacora === "originacion" ? "var(--gold)" : "var(--surface2)", color: vistaBitacora === "originacion" ? "#1A130A" : "var(--text)", borderColor: vistaBitacora === "originacion" ? "var(--gold)" : "var(--border)" }}>Bitácora por mes de originación</button>
        </div>
      )}

      {(esAuxiliar || vistaBitacora === "ingresos") && (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{esAuxiliar ? "Ingresos por mes" : "Bitácora de ingresos mensual"}</div>
          {mesesOrdenados.length === 0 && <div style={{ color: "var(--muted)", fontSize: 14, fontStyle: "italic" }}>Sin movimientos en este periodo.</div>}
          {mesesOrdenados.map((key) => {
            const abierto = !!mesesAbiertos[key];
            const pagosDelMes = Object.values(meses[key].pagosPorCliente || {})
              .map((pl) => ({ ...pl, fechas: [...pl.fechas].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0)) }))
              .sort((a, b) => (a.fechas[0].fecha < b.fechas[0].fecha ? 1 : a.fechas[0].fecha > b.fechas[0].fecha ? -1 : 0));
            return (
              <div key={key} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer" }} onClick={() => toggleMes(key)}>
                  <div style={{ fontWeight: 600, fontSize: 14, textTransform: "capitalize" }}>{monthLabel(key)}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 12, color: abierto ? "var(--text)" : "var(--muted)", fontWeight: abierto ? 700 : 400 }}>{fmtMoney(esAuxiliar ? meses[key].comision : meses[key].ingresos)}</div>
                    {abierto ? <ChevronUp size={16} color="var(--muted)" /> : <ChevronDown size={16} color="var(--muted)" />}
                  </div>
                </div>
                {abierto && (
                  <div style={{ marginTop: 8 }}>
                    {pagosDelMes.length > 0 && (
                      <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>Quién pagó</div>
                        {pagosDelMes.map((pl, i) => (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderBottom: i < pagosDelMes.length - 1 ? "1px solid var(--border)" : "none", gap: 10 }}>
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 600 }}>{pl.nombre}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                                {pl.fechas.map((f, fi) => (
                                  <span key={fi}>
                                    <span onClick={(e) => { e.stopPropagation(); onVerPrestamo(f.prestamoId, f.historialId); }} style={{ cursor: "pointer", textDecoration: "underline dotted", textUnderlineOffset: 2 }}>{fmtDate(f.fecha)}</span>
                                    {fi < pl.fechas.length - 1 ? ", " : ""}
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--gold)", whiteSpace: "nowrap" }}>{fmtMoney(pl.monto)}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      {!esAuxiliar && vistaBitacora === "originacion" && (
        <>
          <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Bitácora por mes de originación</div>
          <BitacoraPorMesOriginacion prestamos={prestamosDelAnio} />
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, color, onClick, wide }) {
  const [mostrarInfo, setMostrarInfo] = useState(false);
  return (
    <div
      onClick={onClick}
      style={{ background: "var(--surface)", border: onClick ? "1px solid var(--gold)" : "1px solid var(--border)", borderRadius: 12, padding: "12px 14px", cursor: onClick ? "pointer" : "default", ...(wide ? { gridColumn: "1 / -1" } : {}) }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 6 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
        {sub && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMostrarInfo((v) => !v); }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", color: "var(--muted)", cursor: "pointer", padding: 0, flexShrink: 0 }}
          >
            <Info size={13} />
          </button>
        )}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: color || "var(--text)" }}>{value}</div>
      {sub && mostrarInfo && <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function BottomNav({ vista, setVista, pendientesCount, oculto }) {
  const items = [
    { key: "inicio", label: "Inicio", icon: Home, badge: pendientesCount },
    { key: "clientes", label: "Clientes", icon: Users },
    { key: "libro", label: "Libro", icon: BookOpen },
    { key: "nuevo", label: "Nuevo", icon: Plus },
  ];
  return (
    // Contenedor exterior: solo posiciona la barra flotante, separada de los
    // bordes, y maneja el mismo mostrar/ocultar de siempre (con teclado).
    <div style={{
      position: "absolute", left: 12, right: 12,
      bottom: "max(28px, calc(env(safe-area-inset-bottom) + 22px))",
      transform: oculto ? "translateY(140%)" : "translateY(0)",
      opacity: oculto ? 0 : 1,
      pointerEvents: oculto ? "none" : "auto",
      transition: "transform 200ms ease, opacity 200ms ease",
    }}>
      {/* Barra "vidrio líquido": traslúcida, con desenfoque de lo que hay
          detrás, esquinas redondeadas y un borde y sombra suaves para que
          se vea flotando sobre el contenido, en vez de pegada al borde. */}
      <div style={{
        display: "flex",
        background: "rgba(28, 33, 41, 0.72)",
        backdropFilter: "blur(22px) saturate(180%)",
        WebkitBackdropFilter: "blur(22px) saturate(180%)",
        border: "1px solid rgba(255,255,255,0.10)",
        borderRadius: 26,
        boxShadow: "0 8px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)",
        overflow: "hidden",
      }}>
        {items.map((it) => {
          const Icon = it.icon;
          const active = vista === it.key;
          return (
            <button key={it.key} onClick={() => setVista(it.key)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 0 9px", background: "transparent", border: "none", color: active ? "var(--gold)" : "var(--muted)", cursor: "pointer", position: "relative" }}>
              <Icon size={19} />
              <span style={{ fontSize: 11 }}>{it.label}</span>
              {it.badge > 0 && (
                <span style={{ position: "absolute", top: 4, right: "calc(50% - 22px)", background: "var(--red)", color: "#fff", fontSize: 10, fontWeight: 700, borderRadius: 8, minWidth: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px" }}>{it.badge}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const cardStyle = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 14px", marginBottom: 10 };
const inputStyle = { width: "100%", boxSizing: "border-box", background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", color: "var(--text)", fontSize: 14, fontFamily: "var(--font-body)" };
const btnPrimary = { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--gold)", color: "#1A130A", border: "none", borderRadius: 8, padding: "10px 16px", fontSize: 14, fontWeight: 700, cursor: "pointer" };
const btnWhatsapp = { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--green)", color: "#0E1712", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", textDecoration: "none", flex: 1, justifyContent: "center" };
const btnGhost = { display: "inline-flex", alignItems: "center", gap: 6, background: "var(--surface2)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const btnGhostFull = { ...btnGhost, flex: 1, justifyContent: "center" };
const pillBtn = { padding: "8px 10px", borderRadius: 20, border: "1px solid var(--border)", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const dayPill = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 12, fontWeight: 600, cursor: "pointer", minWidth: 42 };
