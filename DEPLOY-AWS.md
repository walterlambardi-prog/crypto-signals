# Guía de Deploy en AWS — Crypto Signals

> Configuración desde cero para alguien sin experiencia en AWS.
> Servidor: EC2 (t3.micro — free tier eligible, ~$0 si estás en el primer año, ~$8/mes después).
> Acceso: IAM user con permisos limitados. Sin dominio personalizado.

---

## Índice

1. [Requisitos Previos](#1-requisitos-previos)
2. [Verificar Permisos IAM](#2-verificar-permisos-iam)
3. [Crear Key Pair (para SSH)](#3-crear-key-pair)
4. [Crear Security Group (firewall)](#4-crear-security-group)
5. [Lanzar Instancia EC2](#5-lanzar-instancia-ec2)
6. [Conectarte por SSH](#6-conectarte-por-ssh)
7. [Instalar Node.js y PM2 en el Servidor](#7-instalar-nodejs-y-pm2-en-el-servidor)
8. [Deploy Inicial (manual)](#8-deploy-inicial-manual)
9. [GitHub Actions — CI/CD Automático](#9-github-actions--cicd-automático)
10. [Verificar que Funciona](#10-verificar-que-funciona)
11. [Tips y Mantenimiento](#11-tips-y-mantenimiento)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Requisitos Previos

### En tu máquina local necesitás:
- [x] El proyecto `crypto-signals` funcionando localmente (ya lo tenés ✅)
- [x] Una cuenta AWS con login a la consola web
- [ ] Git instalado (para subir el código) — verificá con `git --version`
- [ ] Un repositorio Git (GitHub/GitLab/CodeCommit) — o podés subir con SCP

### Datos que vas a necesitar:
- Tu **login de AWS** (URL de la consola, usuario y contraseña)

> **Nota**: No necesitás API keys de LLM para el deploy. Cada usuario configura su propio provider, modelo y API key desde `/settings` en el browser.

---

## 2. Verificar Permisos IAM

Antes de empezar, verificá que tu usuario IAM tenga los permisos necesarios.

### Paso a paso:

1. Abrí la consola AWS: https://console.aws.amazon.com
2. Logueate con las credenciales que te dieron
3. En la barra de búsqueda de arriba, buscá **"EC2"** y hacé click

> ⚠️ **Si ves un error de permisos**, pedile a quien administra la cuenta que te agregue
> estos permisos (policies):
> - `AmazonEC2FullAccess`
> - `AmazonVPCReadOnlyAccess`
>
> Decile: *"Necesito poder crear y administrar instancias EC2 y security groups"*

4. Si podés ver el dashboard de EC2 sin errores, estás bien 👍

---

## 3. Crear Key Pair

El Key Pair es como una contraseña, pero en forma de archivo. Lo necesitás para conectarte al servidor por SSH.

### Paso a paso:

1. En la consola EC2, mirá el **menú lateral izquierdo**
2. Click en **"Key Pairs"** (está bajo "Network & Security")
3. Click en **"Create key pair"** (botón naranja arriba a la derecha)
4. Completá:
   - **Name**: `crypto-signals-key`
   - **Key pair type**: `RSA`
   - **Private key file format**: `.pem` (si usás Mac/Linux)
5. Click **"Create key pair"**
6. Se va a descargar un archivo `crypto-signals-key.pem` — **NO LO PIERDAS**

### Asegurar el archivo (en tu Mac):

```bash
# Movelo a tu carpeta SSH
mv ~/Downloads/crypto-signals-key.pem ~/.ssh/

# Darle permisos correctos (obligatorio, sino SSH te rechaza)
chmod 400 ~/.ssh/crypto-signals-key.pem
```

---

## 4. Crear Security Group

El Security Group es el firewall del servidor. Define qué puertos están abiertos.

### Paso a paso:

1. En el menú lateral izquierdo de EC2, click **"Security Groups"** (bajo "Network & Security")
2. Click **"Create security group"**
3. Completá:
   - **Security group name**: `crypto-signals-sg`
   - **Description**: `Allow SSH and app access for crypto-signals`
   - **VPC**: Dejá la que está por defecto (default VPC)

4. En **"Inbound rules"**, click **"Add rule"** tres veces y completá:

   | Type | Port Range | Source | Description |
   |------|-----------|--------|-------------|
   | SSH | 22 | 0.0.0.0/0 | Acceso SSH (protegido por key pair) |
   | Custom TCP | 4111 | 0.0.0.0/0 | Puerto de la app (público) |
   | Custom TCP | 4111 | ::/0 | Puerto de la app (IPv6) |

   > **SSH abierto a 0.0.0.0/0**: Es seguro porque el acceso requiere el archivo `.pem`.
   > Esto permite que GitHub Actions (IP dinámica) pueda hacer deploy automáticamente.

5. **Outbound rules**: Dejá la regla default (All traffic → 0.0.0.0/0)
6. Click **"Create security group"**

---

## 5. Lanzar Instancia EC2

Acá es donde creás el servidor propiamente dicho.

### Paso a paso:

1. En el menú lateral, click **"Instances"**
2. Click **"Launch instances"** (botón naranja)
3. Completá:

   **Name**: `crypto-signals-server`

   **Application and OS Images (AMI)**:
   - Seleccioná **"Amazon Linux 2023"** (ya está seleccionado por defecto)
   - Architecture: **64-bit (x86)**

   **Instance type**:
   - Seleccioná **`t3.micro`** (free tier eligible, 2 vCPU, 1 GB RAM)
   - > Si necesitás más potencia más adelante, podés cambiar el tipo sin perder datos

   **Key pair**:
   - Seleccioná **`crypto-signals-key`** (el que creaste en el paso 3)

   **Network settings**:
   - Click **"Edit"**
   - **Auto-assign public IP**: `Enable`
   - **Firewall (security groups)**: Seleccioná **"Select existing security group"**
   - Elegí **`crypto-signals-sg`** (el que creaste en el paso 4)

   **Configure storage**:
   - Cambiá a **20 GiB** (suficiente para Node.js + SQLite + reportes)
   - Volume type: `gp3` (más rápido, mismo precio)

4. Click **"Launch instance"**
5. Esperá ~1 minuto hasta que el estado sea **"Running"** ✅

### Anotar la IP pública:

1. Click en tu instancia en la lista
2. En el panel inferior, buscá **"Public IPv4 address"**
3. Copiá esa IP — la vas a usar para todo. Ejemplo: `52.14.123.45`

> 📝 **IMPORTANTE**: Esta IP puede cambiar si detenés y reiniciás la instancia.
> Para una IP fija (Elastic IP), ver la sección de Tips al final.

---

## 6. Conectarte por SSH

SSH es la forma de conectarte al servidor desde tu terminal.

### Desde tu Mac:

```bash
ssh -i ~/.ssh/crypto-signals-key.pem ec2-user@TU_IP_PUBLICA
```

Reemplazá `TU_IP_PUBLICA` con la IP del paso anterior.

**Ejemplo real:**
```bash
ssh -i ~/.ssh/crypto-signals-key.pem ec2-user@52.14.123.45
```

> La primera vez te va a preguntar si confiás en el host. Escribí `yes`.

### Si funciona, vas a ver algo como:

```
   ,     #_
   ~\_  ####_        Amazon Linux 2023
  ~~  \_#####\
  ~~     \###|
  ~~       \#/ ___
   ~~       V~' '->
    ~~~         /
      ~~._.   _/
         _/ _/
       _/m/'
[ec2-user@ip-172-31-XX-XX ~]$
```

**¡Ya estás dentro del servidor!** 🎉

---

## 7. Instalar Node.js y PM2 en el Servidor

El servidor viene "vacío". Necesitás instalar Node.js y PM2.

### Ejecutá estos comandos en el servidor (SSH):

```bash
# Instalar nvm (Node Version Manager)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash

# Cargar nvm en la sesión actual
source ~/.bashrc

# Instalar Node.js 22 (la versión que usa el proyecto)
nvm install 22

# Verificar
node --version   # Debe mostrar v22.x.x
npm --version    # Debe mostrar 10.x.x

# Instalar PM2 (process manager)
npm install -g pm2
```

---

## 8. Deploy Inicial (manual)

Este paso se hace **una sola vez** para la primera puesta en marcha. Los deploys posteriores serán automáticos via GitHub Actions.

> **Importante**: El build se hace en tu máquina local (no en el servidor). El t3.micro tiene solo 1GB de RAM y el build puede fallar por falta de memoria.

### Desde tu Mac local:

```bash
cd /ruta/a/tu/proyecto

# Build de producción (genera .mastra/output/)
npm run build

# Subir SOLO el build output al servidor
rsync -avz \
  -e "ssh -i ~/.ssh/crypto-signals-key.pem" \
  .mastra/output/ \
  ec2-user@TU_IP_PUBLICA:~/crypto-signals/
```

### En el servidor (SSH):

```bash
cd ~/crypto-signals

# Instalar solo dependencias de producción
npm install --omit=dev

# Iniciar con PM2 (con --cwd explícito para que las DBs se creen aquí)
pm2 start index.mjs --name crypto-signals --cwd ~/crypto-signals

# Verificar que está corriendo
pm2 status

# Configurar auto-inicio al reiniciar el servidor
pm2 save
pm2 startup
```

> El comando `pm2 startup` muestra un comando que tenés que copiar y ejecutar. Ejemplo:
> ```bash
> sudo env PATH=$PATH:/home/ec2-user/.nvm/versions/node/v22.x.x/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
> ```

### Verificar:

```
http://TU_IP_PUBLICA:4111/reports
```

Si ves el dashboard, el deploy inicial está completo. Ahora configurá GitHub Actions para que los próximos deploys sean automáticos.

---

## 9. GitHub Actions — CI/CD Automático

Con GitHub Actions, cada push/merge a `main` hace deploy automáticamente:

```
push a main → build en GitHub (7GB RAM) → rsync output al EC2 → npm install → pm2 restart → health check
```

### 9.1. Configurar GitHub Secrets

En tu repo de GitHub: **Settings → Secrets and variables → Actions → New repository secret**

Crear estos 3 secrets:

| Secret | Valor |
|--------|-------|
| `EC2_SSH_KEY` | Contenido completo del archivo `~/.ssh/crypto-signals-key.pem` |
| `EC2_HOST` | La IP pública de tu instancia EC2 (ej: `52.14.123.45`) |
| `EC2_USER` | `ec2-user` |

#### Para copiar el contenido del .pem:

```bash
cat ~/.ssh/crypto-signals-key.pem | pbcopy
```

Pegá ese contenido como valor del secret `EC2_SSH_KEY`.

### 9.2. El Workflow

El archivo `.github/workflows/deploy.yml` ya está incluido en el repo. Hace lo siguiente:

1. **Checkout** del código
2. **Setup Node.js 22** con cache de npm
3. **`npm ci`** — instala dependencias
4. **`npm run build`** — genera `.mastra/output/` (en un runner con 7GB RAM, sin riesgo de OOM)
5. **rsync** — sube solo `.mastra/output/` al EC2 (excluye DBs para no perder datos)
6. **`npm install --omit=dev`** — instala deps de producción en el servidor
7. **PM2 restart** — reinicia la app (o la inicia si es la primera vez)
8. **Health check** — verifica HTTP 200 en `/reports`

### 9.3. Probar el deploy

Hacé un push a main:

```bash
git add . && git commit -m "test: CI/CD deploy" && git push origin main
```

Revisá el progreso en: **GitHub → tu repo → Actions**

### 9.4. Deploy manual desde GitHub

Si querés re-ejecutar el último deploy sin hacer push:

1. GitHub → **Actions** → click en el último workflow run
2. Click **"Re-run all jobs"**

### Comandos útiles de PM2 (en el servidor via SSH):

```bash
pm2 logs crypto-signals            # Ver logs en tiempo real
pm2 logs crypto-signals --lines 100  # Últimas 100 líneas
pm2 restart crypto-signals         # Reiniciar la app
pm2 stop crypto-signals            # Detener la app
pm2 delete crypto-signals          # Eliminar del PM2
pm2 monit                          # Monitor en tiempo real
```

---

## 10. Verificar que Funciona

### Desde tu navegador:

1. **Dashboard de reportes**: `http://TU_IP_PUBLICA:4111/reports`
2. **Workflows UI**: `http://TU_IP_PUBLICA:4111/workflows`
3. **Settings**: `http://TU_IP_PUBLICA:4111/settings`

### Configurar y probar:

1. Abrí `http://TU_IP_PUBLICA:4111/settings`
2. Seleccioná un provider y modelo (ej: Google → Gemini 2.5 Flash)
3. Ingresá tu API key y hacé click en **Save & Apply**
4. Andá a `http://TU_IP_PUBLICA:4111/workflows`
5. Ejecutá un análisis de Bitcoin

### Probar con curl:

```bash
curl -s -X POST http://TU_IP_PUBLICA:4111/workflows/execute/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "coinId": "bitcoin",
    "provider": "google",
    "modelName": "gemini-2.5-flash",
    "apiKey": "tu-api-key"
  }'
```

```bash
curl -s -X POST http://TU_IP_PUBLICA:4111/workflows/execute/scan \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 10,
    "provider": "google",
    "modelName": "gemini-2.5-flash",
    "apiKey": "tu-api-key"
  }'
```

> **Nota**: Cada request de workflow requiere `provider`, `modelName` y `apiKey`. No hay configuración global en el servidor — cada usuario usa su propia key.

---

## 11. Tips y Mantenimiento

### IP Fija (Elastic IP) — Para que la IP no cambie

1. En EC2 → **Elastic IPs** (menú lateral)
2. Click **"Allocate Elastic IP address"** → **"Allocate"**
3. Seleccioná la IP generada → **"Actions"** → **"Associate Elastic IP address"**
4. Seleccioná tu instancia `crypto-signals-server` → **"Associate"**

> Gratis mientras la instancia esté corriendo. Cobran ~$3.6/mes si la instancia está detenida.
> Si cambiás la IP, actualizá el secret `EC2_HOST` en GitHub.

### Ver cuánto espacio en disco queda

```bash
df -h
```

### Backup de las bases de datos

```bash
# Desde tu Mac — ambas bases de datos
scp -i ~/.ssh/crypto-signals-key.pem \
  ec2-user@TU_IP_PUBLICA:~/crypto-signals/mastra-reports.db \
  ./backup-reports-$(date +%Y%m%d).db

scp -i ~/.ssh/crypto-signals-key.pem \
  ec2-user@TU_IP_PUBLICA:~/crypto-signals/mastra.db \
  ./backup-mastra-$(date +%Y%m%d).db
```

> **mastra-reports.db**: Reportes HTML generados por los workflows
> **mastra.db**: Memoria del agente (threads, mensajes, working memory, workflow runs)

### Costos estimados mensuales

| Recurso | Costo |
|---------|-------|
| EC2 t3.micro (free tier 1er año) | $0 |
| EC2 t3.micro (después del free tier) | ~$8.50/mes |
| EBS Storage 20GB gp3 | ~$1.60/mes |
| Elastic IP (si la usás) | $0 (activa) / $3.60 (inactiva) |
| Data transfer (primeros 100GB/mes) | $0 |
| GitHub Actions (2000 min/mes gratis) | $0 |
| **Total estimado** | **$0 — $13/mes** |

### Detener para ahorrar (cuando no lo necesites)

```bash
# Desde la consola AWS: Instances → tu instancia → Instance state → Stop instance
# O desde SSH antes de apagar:
pm2 save
```

> Al detener, no se borran datos. Solo dejás de pagar por la instancia EC2.
> Al iniciar de nuevo, la IP pública cambia SALVO que tengas Elastic IP.

---

## 12. Troubleshooting

### "Permission denied" al hacer SSH

```bash
# Verificá permisos del .pem
chmod 400 ~/.ssh/crypto-signals-key.pem
```

### "Connection timed out" al hacer SSH

- Verificá que el Security Group tenga la regla SSH (puerto 22)
- Verificá que la instancia esté en estado **Running**

### "Connection refused" al acceder al puerto 4111

- Verificá que la app esté corriendo: `pm2 status` (en SSH)
- Verificá que el Security Group tenga abierto el puerto 4111

### La app se cae con "out of memory"

- `t3.micro` tiene solo 1GB de RAM
- Opción 1: Upgrade a `t3.small` (2GB, ~$17/mes)
- Opción 2: Agregar swap:
  ```bash
  sudo dd if=/dev/zero of=/swapfile bs=128M count=16  # 2GB swap
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile swap swap defaults 0 0' | sudo tee -a /etc/fstab
  ```

### GitHub Actions falla en el deploy

- Verificá los logs en **GitHub → Actions → click en el run fallido**
- Si falla en SSH: verificá que el secret `EC2_SSH_KEY` contenga el .pem completo (incluyendo `-----BEGIN` y `-----END`)
- Si falla el health check: conectate por SSH y revisá `pm2 logs crypto-signals`

### Las bases de datos están vacías después del deploy

- Las DBs (`mastra.db`, `mastra-reports.db`) están excluidas del rsync — no deberían borrarse
- Si ocurre, verificá que PM2 use `--cwd ~/crypto-signals` (las DBs usan paths relativos al CWD)

---

## Resumen

```bash
# Conectarte al servidor
ssh -i ~/.ssh/crypto-signals-key.pem ec2-user@TU_IP_PUBLICA

# Ver logs
pm2 logs crypto-signals

# Reiniciar app
pm2 restart crypto-signals

# Ver estado
pm2 status
```

### Deploy automático

Cada push/merge a `main` ejecuta el workflow de GitHub Actions automáticamente.

### URLs

- **Reportes**: `http://TU_IP_PUBLICA:4111/reports`
- **Workflows**: `http://TU_IP_PUBLICA:4111/workflows`
- **Settings**: `http://TU_IP_PUBLICA:4111/settings`
- **API**: `http://TU_IP_PUBLICA:4111/api/`
