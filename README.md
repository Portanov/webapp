# Apis Inventario (Proyecto Parcial 1)

Este es un conjunto de endpoints enfocados a la gestion de un inventario, estos estan desarrollados usando API rest bajo la tecnología de NODE JS y Express, complementado con una base de datos temporal de SQLite, este proyecto incluye:

* Enpoints POST, GET, DELETE, PUT.
* TCP socket.
* Pruebas unitarias con JEST.
* Despliegue automatizado con Docker/Github Actions.

### Iniciar el proyecto:

Para iniciar el servidor y levantar los endpoints debes ingresar a la terminal y ejecutar el comando:

```Shell
npm start
```

### Iniciar pruebas de los endpoints:

para ejecutar las pruebas unitarias se debe ejecutar el comando:

```Shell
npm run test:api
```

que iniciara las pruebas de los enpoints devolviendo la siguiente respuesta:

```Shell
Test Suites: 1 passed, 1 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        1.224 s
```

### Para Levantar el proyecto en un espacio de trabajo:

1. Descargar .zip
2. Extraer ZIP dentro de tu equipo.
3. Descargar dependencias.

```Shell
npm install
```

Requisitos previos:

* Node.js 20 o superior.
* npm.
* Docker, si desea ejecutar el proyecto en contenedor.
* Git, si lo clona desde el repositorio.

### Estructura de Carpetas:

```
└── 📁webapp
    └── 📁.github
        └── 📁workflows
            ├── main.yml
    └── 📁backups
    └── 📁tests
        ├── api.test.js
    ├── .dockerignore
    ├── .gitignore
    ├── Dockerfile
    ├── inventario_bd.db
    ├── package.json
    ├── readme.md
    └── server.js
```

## Arquitectura de Aplicación

La aplicacion sigue el siguiente flujo de funcionamiento:

```
Cliente HTTP
    |
    v
API REST - Express
    |
    v
SQLite - inventario_bd.db

Cliente TCP
    |
    v
Servidor TCP
    |
    v
SQLite
```

La funciones principales de los archivos son:

* `server.js`: inicia la API HTTP, el servidor TCP y la conexión con SQLite.
* `inventario_bd.db`: base de datos SQLite.
* `tests/api.test.js`: pruebas automatizadas de la API.
* `Dockerfile`: configuración de la imagen Docker.
* `main.yml`: flujo de integración, construcción y despliegue.

### URL de API's de forma local:

```
http://localhost:80
```

### URL de verificación de funcionamiento:

```
http://localhost/health
```

### Variables de configuración

| Variable | Valor Predeterminado | Descripcion                     |
| -------- | -------------------- | ------------------------------- |
| PORT     | 80                   | Puerto de la API HTTP           |
| TCPPORT  | 6061                 | Puerto del servidor TCP         |
| DB_PATH  | ./inventario_bd.db   | Ruta de la base de datos SQLite |

### Descripción de Endpoints

| Método | Endpoint              | Descripción                              |
| ------- | --------------------- | ----------------------------------------- |
| GET     | `/health`           | Verifica que la API esté activa          |
| GET     | `/inventario`       | Obtiene todos los productos               |
| GET     | `/inventario/:id`   | Obtiene un producto por ID                |
| POST    | `/inventario`       | Crea un producto                          |
| PUT     | `/inventario/:id`   | Actualiza un producto                     |
| DELETE  | `/inventario/:id`   | Elimina un producto                       |
| GET     | `/inventario-count` | Cuenta los productos                      |
| GET     | `/buscar/:nombre`   | Busca productos por nombre                |
| GET     | `/bajo-stock`       | Obtiene productos con cantidad menor a 10 |
| POST    | `/backup`           | Crea una copia de la base de datos        |
| DELETE  | `/vaciar`           | Elimina todos los productos               |
| GET     | `/estadisticas`     | Obtiene estadísticas del inventario      |

### Estructura de la base de datos

| Campo        | Tipo    | Descripción                  |
| ------------ | ------- | ----------------------------- |
| `id`       | INTEGER | Identificador autoincremental |
| `nombre`   | TEXT    | Nombre del producto           |
| `cantidad` | INTEGER | Cantidad disponible           |

### Servidor TCP

este TCP socket permite la comunicación directa en el cual se pueden utilizar los siguientes comandos:

```Shell
{insert:Cuaderno,10} #funciona para insertar nuevos registros
{get:1} #funciona para obtener un objeto especifico
{getall} #sirve para obtener todos los articulos
```

recibiendo respuestas tales como:

```
INSERT OK ID:1
```

### Construcción de imagen docker

para utilizar la imagen de docker para despliegue entre otros se debe construir con la siguiente instrucción:

```Shell
docker build -t webapp-inventario .
```

y para levantar el contenedor en un ec2 o servidor se utiliza:

```Shell
docker run -d `
  --name inventario `
  -p 8080:80 `
  -p 6061:6061 `
  webapp-inventario
```

### Integración Continua y Despliegue

el archivo `main.yml`se encarga del flujo de github actions que despliega el servidor en Docker hub y en Github siguiendo el siguiente flujo:

1. Instalación de Node.js 20.
2. Instalación de dependencias.
3. Ejecución de pruebas.
4. Construcción de la imagen Docker.
5. Publicación en Docker Hub.
6. Despliegue en una instancia EC2 mediante SSH.

Para cumplir este flujo solo se debe hacer push a la rama `master`y se iniciara de forma automatica.

Para el correcto funcionamiento de la integración continua debera configurar a traves de Github SECRETS dentro de su repositorio lo siguiente:

| Secreto               | Descripción                                                         |
| --------------------- | -------------------------------------------------------------------- |
| `DOCKER_USERNAME`   | tu nombre de usuario en la plataforma de Docker HUB                  |
| `DOCKER_TOKEN`      | tu token de lectura y escritura generado de la plataforma Docker HUB |
| `DOCKER_REPOSITORY` | nombre de tu repositorio de imagen en Docker HUB                     |
| `EC2_SSH_KEY`       | tu llave`.pem` que se genera cuando creas el EC2 para conectarte   |
| `EC2_USERNAME`      | tu nombre de usuario en EC2 (regularmente ec2-.... o ubuntu)         |
| `EC2_HOSTNAME`      | IP publica de tu EC2                                                 |

FIN
