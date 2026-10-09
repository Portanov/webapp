const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

jest.setTimeout(20000);

let appProcess;
let database;
let databasePath;
let temporaryDirectory;
let baseUrl;

function runSql(sql, parameters = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, parameters, function (error) {
      if (error) {
        reject(error);
      } else {
        resolve(this);
      }
    });
  });
}

async function resetInventory(items = []) {
  await runSql("DELETE FROM inventario");
  await runSql("DELETE FROM sqlite_sequence WHERE name = 'inventario'");
  for (const item of items) {
    await runSql(
      "INSERT INTO inventario(nombre, cantidad) VALUES(?, ?)",
      [item.nombre, item.cantidad],
    );
  }
}

async function request(route, options) {
  const response = await fetch(`${baseUrl}${route}`, options);
  const body = await response.json();
  return { status: response.status, body };
}

function scenario(api, title, action) {
  test(title, async () => {
    console.log(`\n[API en prueba] ${api}\n[Escenario] ${title}`);
    try {
      await action();
      console.log(`[ÉXITO] ${title}: la respuesta cumplió las validaciones.`);
    } catch (error) {
      console.error(`[FALLO] ${error.message}`);
      throw error;
    }
  });
}

function postJson(route, body) {
  return request(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function getItem(id) {
  const result = await request(`/inventario/${id}`);
  return result.body.data;
}

beforeAll(async () => {
  temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "webapp-api-tests-"));
  databasePath = path.join(temporaryDirectory, "inventario-test.db");
  database = new sqlite3.Database(databasePath);
  await new Promise((resolve, reject) => {
    database.run(
      "CREATE TABLE inventario (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT, cantidad INTEGER)",
      (error) => (error ? reject(error) : resolve()),
    );
  });

  const portServer = net.createServer();
  await new Promise((resolve, reject) => {
    portServer.once("error", reject);
    portServer.listen(0, "127.0.0.1", resolve);
  });
  const port = portServer.address().port;
  await new Promise((resolve, reject) => {
    portServer.close((error) => (error ? reject(error) : resolve()));
  });
  baseUrl = `http://127.0.0.1:${port}`;

  appProcess = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    cwd: temporaryDirectory,
    env: {
      ...process.env,
      PORT: String(port),
      TCPPORT: "0",
      DB_PATH: databasePath,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let startupOutput = "";
  appProcess.stdout.on("data", (chunk) => { startupOutput += chunk.toString(); });
  appProcess.stderr.on("data", (chunk) => { startupOutput += chunk.toString(); });
  appProcess.once("error", (error) => {
    throw new Error(`No se pudo iniciar el servidor: ${error.message}`);
  });

  const startupDeadline = Date.now() + 10000;
  while (Date.now() < startupDeadline) {
    if (appProcess.exitCode !== null) {
      throw new Error(`El servidor terminó al iniciar:\n${startupOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`El servidor no respondió a /health:\n${startupOutput}`);
});

afterAll(async () => {
  if (appProcess && appProcess.exitCode === null) {
    appProcess.kill();
    await new Promise((resolve) => appProcess.once("exit", resolve));
  }
  if (database) {
    await new Promise((resolve) => database.close(resolve));
  }
  if (temporaryDirectory) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
});

describe("API GET /health", () => {
  scenario("GET /health", "responde con estado 200", async () => {
    const result = await request("/health");
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ statusCode: 200, data: "API funcionando 2" });
  });
  scenario("GET /health", "mantiene la respuesta en formato JSON", async () => {
    const response = await fetch(`${baseUrl}/health`);
    expect(response.headers.get("content-type")).toMatch(/application\/json/);
    expect(await response.json()).toHaveProperty("statusCode", 200);
  });
  scenario("GET /health", "sigue respondiendo tras varias consultas", async () => {
    const results = await Promise.all([request("/health"), request("/health")]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
  });
});

describe("API GET /inventario", () => {
  scenario("GET /inventario", "devuelve una lista vacía", async () => {
    await resetInventory();
    const result = await request("/inventario");
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([]);
  });
  scenario("GET /inventario", "devuelve un artículo registrado", async () => {
    await resetInventory([{ nombre: "Cuaderno", cantidad: 4 }]);
    const result = await request("/inventario");
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0]).toMatchObject({ nombre: "Cuaderno", cantidad: 4 });
  });
  scenario("GET /inventario", "devuelve todos los artículos registrados", async () => {
    await resetInventory([
      { nombre: "Lápiz", cantidad: 8 },
      { nombre: "Regla", cantidad: 12 },
    ]);
    const result = await request("/inventario");
    expect(result.body.data).toHaveLength(2);
  });
});

describe("API GET /inventario/:id", () => {
  scenario("GET /inventario/:id", "encuentra un artículo existente", async () => {
    await resetInventory([{ nombre: "Borrador", cantidad: 3 }]);
    const result = await request("/inventario/1");
    expect(result.body.data).toMatchObject({ nombre: "Borrador", cantidad: 3 });
  });
  scenario("GET /inventario/:id", "responde con data null para un ID inexistente", async () => {
    await resetInventory();
    const result = await request("/inventario/999");
    expect(result.status).toBe(200);
    expect(result.body.data).toBeNull();
  });
  scenario("GET /inventario/:id", "no encuentra un ID con formato no numérico", async () => {
    const result = await request("/inventario/no-es-numero");
    expect(result.body.data).toBeNull();
  });
});

describe("API POST /inventario", () => {
  scenario("POST /inventario", "crea un artículo con datos habituales", async () => {
    await resetInventory();
    const result = await postJson("/inventario", { nombre: "Marcador", cantidad: 6 });
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ nombre: "Marcador", cantidad: 6 });
    expect(result.body.data.id).toEqual(expect.any(Number));
  });
  scenario("POST /inventario", "acepta nombres con acentos y espacios", async () => {
    await resetInventory();
    const result = await postJson("/inventario", { nombre: "Papel tamaño A4", cantidad: 2 });
    expect(result.body.data.nombre).toBe("Papel tamaño A4");
  });
  scenario("POST /inventario", "crea un artículo con cantidad cero", async () => {
    await resetInventory();
    const result = await postJson("/inventario", { nombre: "Sin existencias", cantidad: 0 });
    expect(result.body.data.cantidad).toBe(0);
  });
});

describe("API PUT /inventario/:id", () => {
  scenario("PUT /inventario/:id", "actualiza nombre y cantidad", async () => {
    await resetInventory([{ nombre: "Antes", cantidad: 1 }]);
    const result = await request("/inventario/1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Después", cantidad: 5 }),
    });
    expect(result.body.data).toBe("Registro actualizado");
    expect(await getItem(1)).toMatchObject({ nombre: "Después", cantidad: 5 });
  });
  scenario("PUT /inventario/:id", "actualiza solo el artículo indicado", async () => {
    await resetInventory([
      { nombre: "Uno", cantidad: 1 },
      { nombre: "Dos", cantidad: 2 },
    ]);
    await request("/inventario/2", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Dos actualizado", cantidad: 9 }),
    });
    expect(await getItem(1)).toMatchObject({ nombre: "Uno", cantidad: 1 });
    expect(await getItem(2)).toMatchObject({ nombre: "Dos actualizado", cantidad: 9 });
  });
  scenario("PUT /inventario/:id", "no altera artículos cuando el ID no existe", async () => {
    await resetInventory([{ nombre: "Intacto", cantidad: 7 }]);
    const result = await request("/inventario/999", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre: "Fantasma", cantidad: 0 }),
    });
    expect(result.status).toBe(200);
    expect(await getItem(1)).toMatchObject({ nombre: "Intacto", cantidad: 7 });
  });
});

describe("API DELETE /inventario/:id", () => {
  scenario("DELETE /inventario/:id", "elimina un artículo existente", async () => {
    await resetInventory([{ nombre: "Eliminar", cantidad: 1 }]);
    const result = await request("/inventario/1", { method: "DELETE" });
    expect(result.body.data).toBe("Registro eliminado");
    expect(await getItem(1)).toBeNull();
  });
  scenario("DELETE /inventario/:id", "conserva los demás artículos", async () => {
    await resetInventory([
      { nombre: "Conservar", cantidad: 4 },
      { nombre: "Eliminar", cantidad: 2 },
    ]);
    await request("/inventario/2", { method: "DELETE" });
    expect(await getItem(1)).toMatchObject({ nombre: "Conservar", cantidad: 4 });
  });
  scenario("DELETE /inventario/:id", "tolera eliminar un ID inexistente", async () => {
    await resetInventory();
    const result = await request("/inventario/999", { method: "DELETE" });
    expect(result.status).toBe(200);
    expect(result.body.data).toBe("Registro eliminado");
  });
});

describe("API GET /inventario-count", () => {
  scenario("GET /inventario-count", "cuenta correctamente una lista vacía", async () => {
    await resetInventory();
    const result = await request("/inventario-count");
    expect(result.body.data.total).toBe(0);
  });
  scenario("GET /inventario-count", "cuenta un solo artículo", async () => {
    await resetInventory([{ nombre: "Uno", cantidad: 1 }]);
    const result = await request("/inventario-count");
    expect(result.body.data.total).toBe(1);
  });
  scenario("GET /inventario-count", "cuenta todos los artículos", async () => {
    await resetInventory([
      { nombre: "Uno", cantidad: 1 },
      { nombre: "Dos", cantidad: 2 },
      { nombre: "Tres", cantidad: 3 },
    ]);
    const result = await request("/inventario-count");
    expect(result.body.data.total).toBe(3);
  });
});

describe("API GET /buscar/:nombre", () => {
  scenario("GET /buscar/:nombre", "encuentra coincidencias parciales", async () => {
    await resetInventory([{ nombre: "Lápiz rojo", cantidad: 3 }]);
    const result = await request("/buscar/rojo");
    expect(result.body.data).toHaveLength(1);
    expect(result.body.data[0].nombre).toBe("Lápiz rojo");
  });
  scenario("GET /buscar/:nombre", "busca sin distinguir mayúsculas", async () => {
    await resetInventory([{ nombre: "Cuaderno Azul", cantidad: 2 }]);
    const result = await request("/buscar/azul");
    expect(result.body.data).toHaveLength(1);
  });
  scenario("GET /buscar/:nombre", "devuelve lista vacía si no hay coincidencias", async () => {
    await resetInventory([{ nombre: "Regla", cantidad: 2 }]);
    const result = await request("/buscar/inexistente");
    expect(result.body.data).toEqual([]);
  });
});

describe("API GET /bajo-stock", () => {
  scenario("GET /bajo-stock", "incluye cantidades menores que diez", async () => {
    await resetInventory([{ nombre: "Pocas", cantidad: 9 }]);
    const result = await request("/bajo-stock");
    expect(result.body.data.map((item) => item.nombre)).toContain("Pocas");
  });
  scenario("GET /bajo-stock", "excluye la cantidad límite de diez", async () => {
    await resetInventory([{ nombre: "Límite", cantidad: 10 }]);
    const result = await request("/bajo-stock");
    expect(result.body.data).toEqual([]);
  });
  scenario("GET /bajo-stock", "solo incluye los artículos bajo el límite", async () => {
    await resetInventory([
      { nombre: "Bajo", cantidad: 2 },
      { nombre: "Suficiente", cantidad: 15 },
    ]);
    const result = await request("/bajo-stock");
    expect(result.body.data.map((item) => item.nombre)).toEqual(["Bajo"]);
  });
});

describe("API POST /backup", () => {
  scenario("POST /backup", "crea un archivo de respaldo", async () => {
    await resetInventory();
    const result = await postJson("/backup", {});
    expect(result.status).toBe(200);
    expect(result.body.data).toBe("Backup realizado correctamente");
    expect(fs.readdirSync(temporaryDirectory).some((file) => file.startsWith("backup-"))).toBe(true);
  });
  scenario("POST /backup", "respalda una base con artículos", async () => {
    await resetInventory([{ nombre: "Respaldo", cantidad: 11 }]);
    const result = await postJson("/backup", {});
    expect(result.status).toBe(200);
    const backup = fs.readdirSync(temporaryDirectory).find((file) => file.startsWith("backup-"));
    expect(fs.statSync(path.join(temporaryDirectory, backup)).size).toBeGreaterThan(0);
  });
  scenario("POST /backup", "permite solicitar respaldos consecutivos", async () => {
    await resetInventory();
    await postJson("/backup", {});
    await new Promise((resolve) => setTimeout(resolve, 5));
    const result = await postJson("/backup", {});
    expect(result.status).toBe(200);
    expect(fs.readdirSync(temporaryDirectory).filter((file) => file.startsWith("backup-")).length).toBeGreaterThanOrEqual(2);
  });
});

describe("API DELETE /vaciar", () => {
  scenario("DELETE /vaciar", "vacía el inventario", async () => {
    await resetInventory([{ nombre: "Borrar", cantidad: 4 }]);
    const result = await request("/vaciar", { method: "DELETE" });
    expect(result.body.data).toBe("Inventario vaciado");
    expect((await request("/inventario")).body.data).toEqual([]);
  });
  scenario("DELETE /vaciar", "vacía todos los artículos, no solo uno", async () => {
    await resetInventory([
      { nombre: "Uno", cantidad: 1 },
      { nombre: "Dos", cantidad: 2 },
    ]);
    await request("/vaciar", { method: "DELETE" });
    expect((await request("/inventario-count")).body.data.total).toBe(0);
  });
  scenario("DELETE /vaciar", "puede ejecutarse cuando ya está vacío", async () => {
    await resetInventory();
    const result = await request("/vaciar", { method: "DELETE" });
    expect(result.status).toBe(200);
    expect(result.body.data).toBe("Inventario vaciado");
  });

  describe("API GET /estadisticas", () => {
    scenario(
      "GET /estadisticas",
      "devuelve cero cuando el inventario está vacío",
      async () => {
        await resetInventory();

        const result = await request("/estadisticas");

        expect(result.status).toBe(200);
        expect(result.body.data.totalProductos).toBe(0);
        expect(result.body.data.totalUnidades).toBe(0);
      },
    );

    scenario(
      "GET /estadisticas",
      "calcula correctamente los totales",
      async () => {
        await resetInventory([
          { nombre: "Lapiz", cantidad: 10 },
          { nombre: "Pluma", cantidad: 5 },
        ]);

        const result = await request("/estadisticas");

        expect(result.body.data.totalProductos).toBe(2);
        expect(result.body.data.totalUnidades).toBe(15);
      },
    );
  });
});