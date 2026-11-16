/** Applies the reference texture's cloud-mask alpha to the existing globe, not to surface transparency. */
export async function createEarthView(globe, THREE, source, root) {
  const [texture, polarImage] = await Promise.all([
    new THREE.TextureLoader().loadAsync(source),
    new THREE.TextureLoader().loadAsync("/globe/textures/earth-bmng-8k.jpg"),
  ]);
  const polarCanvas = document.createElement("canvas");
  polarCanvas.width = 2048;
  polarCanvas.height = 1024;
  const context = polarCanvas.getContext("2d");
  if (!context) throw new Error("Unable to prepare the polar map.");
  context.drawImage(polarImage.image, 0, 0, polarCanvas.width, polarCanvas.height);
  const polarTexture = new THREE.CanvasTexture(polarCanvas);
  polarTexture.wrapS = THREE.RepeatWrapping;
  polarTexture.minFilter = THREE.LinearFilter;
  polarImage.dispose();
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  const sampling = `vec4 seamless(sampler2D image,vec2 p){
    vec4 color=texture2D(image,p);
    float blend=1.-smoothstep(0.,.025,min(p.x,1.-p.x));
    if(blend>0.)color=mix(color,(texture2D(image,vec2(.002,p.y))+texture2D(image,vec2(.998,p.y)))*.5,blend);
    return color;
  }`;
  const material = new THREE.ShaderMaterial({
    uniforms: { earthMap: { value: texture }, polarMap: { value: polarTexture } },
    vertexShader: `varying vec2 mapUV; varying vec3 normalWorld; varying vec3 pointWorld;
      void main(){mapUV=uv;normalWorld=normalize(mat3(modelMatrix)*normal);pointWorld=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `${sampling} uniform sampler2D earthMap; uniform sampler2D polarMap; varying vec2 mapUV; varying vec3 normalWorld; varying vec3 pointWorld;
      void main(){
        vec4 surface=seamless(earthMap,mapUV);
        vec3 base=surface.rgb;
        float polar=smoothstep(.63,.73,abs(mapUV.y-.5)*2.);
        vec3 polarSample=seamless(polarMap,mapUV).rgb;
        float ice=smoothstep(.38,.7,min(polarSample.r,min(polarSample.g,polarSample.b)));
        float land=smoothstep(0.,.09,polarSample.g-polarSample.b);
        vec3 polarColor=mix(vec3(.16,.68,.76),vec3(.55,.7,.43),land);
        polarColor=mix(polarColor,vec3(.91,.97,.98),ice);
        polarColor=mix(polarColor,vec3(.91,.97,.98),smoothstep(.92,.985,mapUV.y*2.-1.));
        base=mix(base,polarColor,polar);
        float light=clamp(dot(normalize(normalWorld),normalize(vec3(-.61,.69,1.))),0.,1.);
        float facing=max(dot(normalize(normalWorld),normalize(cameraPosition-pointWorld)),0.);
        base=base*(.76+.24*light)+vec3(.024,.048,.044);
        base=mix(base,vec3(.72,.94,.98),pow(1.-facing,3.65)*.64);
        gl_FragColor=vec4(base,1.);
      }`,
    transparent: false,
  });
  const standard = globe.globeMaterial();
  const clouds = new THREE.Mesh(
    new THREE.SphereGeometry(globe.getGlobeRadius() * 1.006, 96, 64).rotateY(-Math.PI / 2),
    new THREE.ShaderMaterial({
      uniforms: { earthMap: { value: texture } },
      vertexShader: "varying vec2 mapUV; void main(){mapUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: sampling + " uniform sampler2D earthMap; varying vec2 mapUV; void main(){float a=max(0.,(seamless(earthMap,mapUV).a-.55)*2.2)*.55*(1.-smoothstep(.63,.73,abs(mapUV.y-.5)*2.));gl_FragColor=vec4(.93,1.,.99,a);}",
      transparent: true, depthWrite: false,
    }),
  );
  clouds.name = "Cloud alpha layer";
  clouds.renderOrder = 2;
  root.add(clouds);
  const apply = () => { globe.globeMaterial(material); clouds.visible = true; };
  apply();
  return {
    select(value, base) {
      if (value === "stylized") apply();
      else { clouds.visible = false; globe.globeMaterial(standard); globe.globeImageUrl(value.startsWith("/") ? value : base + value); }
    },
  };
}
