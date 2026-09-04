# Cartera Gold

## Despliegue continuo (GitHub + Netlify)

Este repo ya trae `netlify.toml`, así que Netlify detecta solo el comando de
build (`npm run build`) y la carpeta a publicar (`dist`). No hace falta
configurar nada manualmente en el panel.

### 1. Subir este proyecto a GitHub

```bash
cd "cartera-gold 2"
git init
git add .
git commit -m "Version inicial"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/cartera-gold.git
git push -u origin main
```

(Antes crea el repositorio vacío en https://github.com/new — sin agregar
README ni .gitignore ahí, para evitar conflictos con este.)

### 2. Conectar el repo en Netlify

1. Entra a https://app.netlify.com
2. **Add new site → Import an existing project**
3. Elige GitHub y selecciona el repositorio `cartera-gold`
4. Netlify lee `netlify.toml` automáticamente (build: `npm run build`,
   publish: `dist`) — solo da clic en **Deploy**

### 3. Deploys automáticos

De ahí en adelante, cada vez que hagas cambios:

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

Netlify detecta el push, corre el build y publica la nueva versión sola —
no necesitas volver a correr `npm run build` a mano ni subir nada por Drag
& Drop.
