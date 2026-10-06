const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const net = require('net');

const app = express();
const PORT = process.env.PORT || 80;
const TCPPORT = process.env.TCPPORT || 6061;
const DATABASE_PATH = process.env.DB_PATH || "./inventario_bd.db";

app.use(express.json());

const tcpServer = net.createServer((socket) => {
  console.log("Client connected");

  socket.on("data", (data) => {
    const mensaje = data.toString().trim();
    console.log("Recibido:", mensaje);
    if (mensaje.startsWith("{insert:")) {
      try {
        const contenido = mensaje.replace("{insert:", "").replace("}", "");
        const [nombre, cantidad] = contenido.split(",");
        if (!nombre || !cantidad) {
          socket.write("FORMATO INVALIDO\n");
          return;
        }
        db.run(
          "INSERT INTO inventario(nombre,cantidad) VALUES(?,?)",
          [nombre.trim(), parseInt(cantidad)],
          function (err) {
            if (err) {
              console.error(err.message);
              socket.write("ERROR INSERT\n");
              return;
            }
            socket.write(`INSERT OK ID:${this.lastID}\n`);
          },
        );
      } catch (error) {
        socket.write("ERROR PROCESANDO MENSAJE\n");
      }
    } else if (mensaje.startsWith("{get:")) {
      const id = mensaje.replace("{get:", "").replace("}", "");

      db.get("SELECT * FROM inventario WHERE id = ?", [id], (err, row) => {
        if (err) {
          socket.write("ERROR CONSULTA\n");
          return;
        }

        socket.write(JSON.stringify(row) + "\n");
      });
    } else if (mensaje === "{getall}") {
      db.all("SELECT * FROM inventario", [], (err, rows) => {
        if (err) {
          socket.write("ERROR CONSULTA\n");
          return;
        }

        socket.write(JSON.stringify(rows) + "\n");
      });
    } else {
      socket.write("FORMATO INVALIDO\n");
    }
  });

  // Event when the client connection is closed
  socket.on("end", () => {
    console.log("Cliente desconectado");
  });

  // Handle connection errors
  socket.on("error", (err) => {
    console.error("Connection error:", err);
  });
});

// Conexión a SQLite
const db = new sqlite3.Database(DATABASE_PATH, (err) => {
  if (err) {
    console.error(err.message);
  } else {
    console.log("Base de datos conectada");
  }
});

// 1. Health Check
app.get("/health", (req, res) => {
  res.json({
    statusCode: 200,
    data: "API funcionando",
  });
});

// 2. Obtener todo el inventario
app.get("/inventario", (req, res) => {
  db.all("SELECT * FROM inventario", [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        statusCode: 500,
        data: err.message,
      });
    }

    res.json({
      statusCode: 200,
      data: rows,
    });
  });
});

// 3. Obtener por ID
app.get("/inventario/:id", (req, res) => {
  db.get(
    "SELECT * FROM inventario WHERE id = ?",
    [req.params.id],
    (err, row) => {
      if (err) {
        return res.status(500).json({
          statusCode: 500,
          data: err.message,
        });
      }

      res.json({
        statusCode: 200,
        data: row,
      });
    },
  );
});

// 4. Crear artículo
app.post("/inventario", (req, res) => {
  const { nombre, cantidad } = req.body;

  db.run(
    "INSERT INTO inventario(nombre,cantidad) VALUES(?,?)",
    [nombre, cantidad],
    function (err) {
      if (err) {
        return res.status(500).json({
          statusCode: 500,
          data: err.message,
        });
      }

      res.json({
        statusCode: 200,
        data: {
          id: this.lastID,
          nombre,
          cantidad,
        },
      });
    },
  );
});

// 5. Actualizar artículo
app.put("/inventario/:id", (req, res) => {
  const { nombre, cantidad } = req.body;

  db.run(
    "UPDATE inventario SET nombre=?, cantidad=? WHERE id=?",
    [nombre, cantidad, req.params.id],
    function (err) {
      if (err) {
        return res.status(500).json({
          statusCode: 500,
          data: err.message,
        });
      }

      res.json({
        statusCode: 200,
        data: "Registro actualizado",
      });
    },
  );
});

// 6. Eliminar artículo
app.delete("/inventario/:id", (req, res) => {
  db.run("DELETE FROM inventario WHERE id=?", [req.params.id], function (err) {
    if (err) {
      return res.status(500).json({
        statusCode: 500,
        data: err.message,
      });
    }

    res.json({
      statusCode: 200,
      data: "Registro eliminado",
    });
  });
});

// 7. Contar artículos
app.get("/inventario-count", (req, res) => {
  db.get("SELECT COUNT(*) AS total FROM inventario", [], (err, row) => {
    if (err) {
      return res.status(500).json({
        statusCode: 500,
        data: err.message,
      });
    }

    res.json({
      statusCode: 200,
      data: row,
    });
  });
});

// 8. Buscar por nombre
app.get("/buscar/:nombre", (req, res) => {
  const nombre = `%${req.params.nombre}%`;

  db.all(
    "SELECT * FROM inventario WHERE nombre LIKE ?",
    [nombre],
    (err, rows) => {
      if (err) {
        return res.status(500).json({
          statusCode: 500,
          data: err.message,
        });
      }

      res.json({
        statusCode: 200,
        data: rows,
      });
    },
  );
});

// 9. Productos con bajo stock
app.get("/bajo-stock", (req, res) => {
  db.all("SELECT * FROM inventario WHERE cantidad < 10", [], (err, rows) => {
    if (err) {
      return res.status(500).json({
        statusCode: 500,
        data: err.message,
      });
    }

    res.json({
      statusCode: 200,
      data: rows,
    });
  });
});

// 10. Backup BD
app.post("/backup", (req, res) => {
  const fecha = Date.now();

  fs.copyFile(DATABASE_PATH, `./backup-${fecha}.db`, (err) => {
    if (err) {
      return res.status(500).json({
        statusCode: 500,
        data: err.message,
      });
    }

    res.json({
      statusCode: 200,
      data: "Backup realizado correctamente",
    });
  });
});

// 11. Vaciar BD
app.delete("/vaciar", (req, res) => {
  db.run("DELETE FROM inventario", [], (err) => {
    if (err) {
      return res.status(500).json({
        statusCode: 500,
        data: err.message,
      });
    }

    res.json({
      statusCode: 200,
      data: "Inventario vaciado",
    });
  });
});

/* Socket TCP */

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en puerto ${PORT}`);
});

tcpServer.listen(TCPPORT, () => {
  console.log(`TCP Socket escuchando en puerto ${TCPPORT}`);
})

