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
7. [Instalar Node.js en el Servidor](#7-instalar-nodejs-en-el-servidor)
8. [Subir el Proyecto](#8-subir-el-proyecto)
9. [Configurar Variables de Entorno](#9-configurar-variables-de-entorno)
10. [Build y Arrancar](#10-build-y-arrancar)
11. [Mantener el Proceso Vivo con PM2](#11-mantener-el-proceso-vivo-con-pm2)
12. [Verificar que Funciona](#12-verificar-que-funciona)
13. [Tips y Mantenimiento](#13-tips-y-mantenimiento)
14. [Troubleshooting](#14-troubleshooting)

---

## 1. Requisitos Previos

### En tu máquina local necesitás:
- [x] El proyecto `crypto-signals` funcionando localmente (ya lo tenés ✅)
- [x] Una cuenta AWS con login a la consola web
- [ ] Git instalado (para subir el código) — verificá con `git --version`
- [ ] Un repositorio Git (GitHub/GitLab/CodeCommit) — o podés subir con SCP

### Datos que vas a necesitar:
- Tu **API key de Google** (`GOOGLE_GENERATIVE_AI_API_KEY`)
- Tu **login de AWS** (URL de la consola, usuario y contraseña)

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
   | SSH | 22 | My IP | Acceso SSH desde mi IP |
   | Custom TCP | 4111 | 0.0.0.0/0 | Puerto de la app (público) |
   | Custom TCP | 4111 | ::/0 | Puerto de la app (IPv6) |

   > **"My IP"** se autocompleta con tu IP actual. Si tu IP cambia (WiFi diferente),
   > vas a tener que actualizar esta regla.

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

## 7. Instalar Node.js en el Servidor

El servidor viene "vacío". Necesitás instalar Node.js.

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
```

### Instalar Git (para clonar el repo):

```bash
sudo dnf install -y git
```

---

## 8. Subir el Proyecto

Tenés dos opciones para subir el código al servidor:

### Opción A — Con Git (recomendado) 🟢

Si tu proyecto está en GitHub/GitLab:

```bash
# En el servidor (SSH)
cd ~
git clone https://github.com/TU_USUARIO/crypto-signals.git
cd crypto-signals
npm ci
```

> Si es un repo privado, vas a necesitar un Personal Access Token.
> En GitHub: Settings → Developer settings → Personal access tokens → Generate new token

### Opción B — Con SCP (sin Git)

Desde tu Mac local (NO desde SSH, abrí otra terminal):

```bash
# Desde tu máquina local, subir todo el proyecto excepto node_modules
cd /ruta/a/tu/proyecto
rsync -avz --exclude 'node_modules' --exclude '.mastra' --exclude '*.db' \
  -e "ssh -i ~/.ssh/crypto-signals-key.pem" \
  . ec2-user@TU_IP_PUBLICA:~/crypto-signals/
```

Después, en el servidor:
```bash
cd ~/crypto-signals
npm ci
```

---

## 9. Configurar Variables de Entorno

### En el servidor (SSH):

```bash
cd ~/crypto-signals

# Crear archivo .env
cat > .env << 'EOF'
GOOGLE_GENERATIVE_AI_API_KEY=tu-api-key-de-google-aqui
EOF
```

> Reemplazá `tu-api-key-de-google-aqui` con tu API key real.

### Verificar que el archivo se creó:

```bash
cat .env
# Debe mostrar: GOOGLE_GENERATIVE_AI_API_KEY=sk-xxxxxxx...
```

> ⚠️ **NUNCA subas el archivo `.env` a Git.** Verificá que `.gitignore` lo incluye.

---

## 10. Build y Arrancar

### En el servidor (SSH):

```bash
cd ~/crypto-signals

# Build de producción
npm run build

# Probar que arranca
npm start
```

Si ves algo como:
```
Mastra server listening on port 4111
```

¡Funciona! Probá acceder desde tu navegador:

```
http://TU_IP_PUBLICA:4111/reports
```

Presioná `Ctrl+C` para detener (lo vamos a configurar con PM2 para que corra permanente).

---

## 11. Mantener el Proceso Vivo con PM2

PM2 es un process manager que mantiene tu app corriendo aunque cierres SSH, y la reinicia si se cae.

### Instalar PM2:

```bash
npm install -g pm2
```

### Iniciar la app con PM2:

```bash
cd ~/crypto-signals

# Iniciar el servidor de Mastra
pm2 start .mastra/output/index.mjs --name crypto-signals

# Verificar que está corriendo
pm2 status
```

Deberías ver:
```
┌─────┬────────────────────┬──────┬──────┬───────────┬──────────┐
│ id  │ name               │ mode │ pid  │ status    │ cpu      │
├─────┼────────────────────┼──────┼──────┼───────────┼──────────┤
│ 0   │ crypto-signals     │ fork │ 1234 │ online    │ 0%       │
└─────┴────────────────────┴──────┴──────┴───────────┴──────────┘
```

### Configurar auto-inicio al reiniciar el servidor:

```bash
pm2 save
pm2 startup
```

> Esto muestra un comando que tenés que copiar y ejecutar. Ejemplo:
> ```bash
> sudo env PATH=$PATH:/home/ec2-user/.nvm/versions/node/v22.x.x/bin pm2 startup systemd -u ec2-user --hp /home/ec2-user
> ```
> Copiá exactamente lo que te muestre y ejecutalo.

### Comandos útiles de PM2:

```bash
pm2 logs crypto-signals     # Ver logs en tiempo real
pm2 logs crypto-signals --lines 100  # Últimas 100 líneas
pm2 restart crypto-signals  # Reiniciar la app
pm2 stop crypto-signals     # Detener la app
pm2 delete crypto-signals   # Eliminar del PM2
pm2 monit                   # Monitor en tiempo real
```

---

## 12. Verificar que Funciona

### Desde tu navegador:

1. **Dashboard de reportes**: `http://TU_IP_PUBLICA:4111/reports`
2. **Mastra Studio**: `http://TU_IP_PUBLICA:4111`

### Probar un workflow:

Desde tu Mac (o cualquier máquina):

```bash
# Ejecutar análisis de Bitcoin
curl -X POST http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/start \
  -H "Content-Type: application/json" \
  -d '{"inputData": {"coinId": "bitcoin"}}'

# Ejecutar market scan
curl -X POST http://TU_IP_PUBLICA:4111/api/workflows/market-scan-workflow/start \
  -H "Content-Type: application/json" \
  -d '{"inputData": {}}'
```

Después revisá los reportes en: `http://TU_IP_PUBLICA:4111/reports`

---

## 13. Tips y Mantenimiento

### IP Fija (Elastic IP) — Para que la IP no cambie

1. En EC2 → **Elastic IPs** (menú lateral)
2. Click **"Allocate Elastic IP address"** → **"Allocate"**
3. Seleccioná la IP generada → **"Actions"** → **"Associate Elastic IP address"**
4. Seleccioná tu instancia `crypto-signals-server` → **"Associate"**

> Gratis mientras la instancia esté corriendo. Cobran ~$3.6/mes si la instancia está detenida.

### Actualizar el código

```bash
# En el servidor
cd ~/crypto-signals
git pull                     # Si usás Git
npm ci                       # Reinstalar dependencias
npm run build                # Rebuild
pm2 restart crypto-signals   # Reiniciar la app
```

### Ver cuánto espacio en disco queda

```bash
df -h
```

### Backup de las bases de datos

```bash
# Desde tu Mac
scp -i ~/.ssh/crypto-signals-key.pem \
  ec2-user@TU_IP_PUBLICA:~/crypto-signals/src/mastra/public/mastra-reports.db \
  ./backup-reports-$(date +%Y%m%d).db
```

### Costos estimados mensuales

| Recurso | Costo |
|---------|-------|
| EC2 t3.micro (free tier 1er año) | $0 |
| EC2 t3.micro (después del free tier) | ~$8.50/mes |
| EBS Storage 20GB gp3 | ~$1.60/mes |
| Elastic IP (si la usás) | $0 (activa) / $3.60 (inactiva) |
| Data transfer (primeros 100GB/mes) | $0 |
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

## 14. Troubleshooting

### "Permission denied" al hacer SSH

```bash
# Verificá permisos del .pem
chmod 400 ~/.ssh/crypto-signals-key.pem
```

### "Connection timed out" al hacer SSH

- Verificá que el Security Group tenga la regla SSH (puerto 22) con **tu IP actual**
- Tu IP pudo haber cambiado → actualizá la regla en Security Groups

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

### "npm run build" falla por memoria

```bash
export NODE_OPTIONS="--max-old-space-size=768"
npm run build
```

### No puedo ver los reportes

- Verificá la URL: `http://` (no `https://`)
- Verificá que usás la IP pública, no la privada
- Probá: `curl http://localhost:4111/reports` desde dentro del servidor (SSH)

---

## Resumen de comandos clave

```bash
# Conectarte al servidor
ssh -i ~/.ssh/crypto-signals-key.pem ec2-user@TU_IP_PUBLICA

# Ver logs
pm2 logs crypto-signals

# Reiniciar app
pm2 restart crypto-signals

# Actualizar código + reiniciar
cd ~/crypto-signals && git pull && npm ci && npm run build && pm2 restart crypto-signals

# Ver estado
pm2 status
```

## URLs finales

- **Reportes**: `http://TU_IP_PUBLICA:4111/reports`
- **Studio**: `http://TU_IP_PUBLICA:4111`
- **API**: `http://TU_IP_PUBLICA:4111/api/`
