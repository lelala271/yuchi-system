import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const vehicleColors = [0xff7b54, 0x34d399, 0x60a5fa, 0xf59e0b, 0x06b6d4];

const getVehicleColor = (vehicleId) => {
  let hash = 0;
  for (let i = 0; i < vehicleId.length; i += 1) {
    hash = (hash << 5) - hash + vehicleId.charCodeAt(i);
    hash |= 0;
  }
  return vehicleColors[Math.abs(hash) % vehicleColors.length];
};

const createVehicleObject = (vehicleId) => {
  const group = new THREE.Group();
  group.userData.vehicleId = vehicleId;

  const bodyGeometry = new THREE.BoxGeometry(0.55, 0.22, 0.35);
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: getVehicleColor(vehicleId),
    metalness: 0.2,
    roughness: 0.4
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 0.16;
  group.add(body);

  const sensorGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.04, 24);
  const sensorMaterial = new THREE.MeshStandardMaterial({ color: 0x1f2937 });
  const sensor = new THREE.Mesh(sensorGeometry, sensorMaterial);
  sensor.rotation.x = Math.PI / 2;
  sensor.position.set(0.2, 0.27, 0);
  group.add(sensor);

  const wheelGeometry = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 16);
  const wheelMaterial = new THREE.MeshStandardMaterial({ color: 0x111827 });
  const wheelOffsets = [
    [0.18, 0.06, 0.15],
    [0.18, 0.06, -0.15],
    [-0.18, 0.06, 0.15],
    [-0.18, 0.06, -0.15]
  ];

  wheelOffsets.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y, z);
    group.add(wheel);
  });

  return group;
};

function DigitalTwinScene({ vehicles, selectedVehicleId, onSelectVehicle }) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const frameRef = useRef(null);
  const vehicleMapRef = useRef(new Map());
  const raycasterRef = useRef(new THREE.Raycaster());
  const pointerRef = useRef(new THREE.Vector2());

  useEffect(() => {
    if (!containerRef.current) {
      return undefined;
    }

    const container = containerRef.current;
    const vehicleMap = vehicleMapRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeaf4ff);
    scene.fog = new THREE.Fog(0xeaf4ff, 7, 16);

    const camera = new THREE.PerspectiveCamera(52, width / Math.max(height, 1), 0.1, 100);
    camera.position.set(4.2, 4.2, 4.2);
    camera.lookAt(1.5, 0, 1.8);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.65);
    scene.add(ambient);

    const directional = new THREE.DirectionalLight(0xffffff, 0.9);
    directional.position.set(3, 6, 2);
    directional.castShadow = true;
    directional.shadow.mapSize.set(1024, 1024);
    directional.shadow.camera.near = 1;
    directional.shadow.camera.far = 15;
    scene.add(directional);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(7, 7),
      new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.95, metalness: 0.05 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(7, 14, 0x60a5fa, 0x93c5fd);
    grid.position.y = 0.001;
    scene.add(grid);

    const laneMaterial = new THREE.LineDashedMaterial({
      color: 0x1d4ed8,
      linewidth: 1,
      dashSize: 0.12,
      gapSize: 0.08,
      transparent: true,
      opacity: 0.35
    });

    [-1.2, 0, 1.2].forEach((offset) => {
      const points = [new THREE.Vector3(-3.2, 0.02, offset), new THREE.Vector3(3.2, 0.02, offset)];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, laneMaterial);
      line.computeLineDistances();
      scene.add(line);
    });

    const animate = () => {
      frameRef.current = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      const newWidth = container.clientWidth;
      const newHeight = container.clientHeight;
      camera.aspect = newWidth / Math.max(newHeight, 1);
      camera.updateProjectionMatrix();
      renderer.setSize(newWidth, newHeight);
    };

    const onPointerDown = (event) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointerRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycasterRef.current.setFromCamera(pointerRef.current, camera);
      const intersections = raycasterRef.current.intersectObjects(scene.children, true);

      const selected = intersections.find((hit) => {
        let current = hit.object;
        while (current && !current.userData.vehicleId) {
          current = current.parent;
        }
        return Boolean(current?.userData.vehicleId);
      });

      if (!selected) {
        return;
      }

      let target = selected.object;
      while (target && !target.userData.vehicleId) {
        target = target.parent;
      }

      if (target?.userData.vehicleId && typeof onSelectVehicle === 'function') {
        onSelectVehicle(target.userData.vehicleId);
      }
    };

    window.addEventListener('resize', onResize);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;

    return () => {
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }

      vehicleMap.forEach((mesh) => {
        mesh.traverse((obj) => {
          if (obj.geometry) {
            obj.geometry.dispose();
          }
          if (obj.material) {
            if (Array.isArray(obj.material)) {
              obj.material.forEach((material) => material.dispose());
            } else {
              obj.material.dispose();
            }
          }
        });
      });
      vehicleMap.clear();

      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [onSelectVehicle]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) {
      return;
    }

    const nextIds = new Set();

    vehicles.forEach((vehicle) => {
      if (!vehicle?.vehicleId) {
        return;
      }

      nextIds.add(vehicle.vehicleId);

      let object = vehicleMapRef.current.get(vehicle.vehicleId);
      if (!object) {
        object = createVehicleObject(vehicle.vehicleId);
        object.castShadow = true;
        vehicleMapRef.current.set(vehicle.vehicleId, object);
        scene.add(object);
      }

      object.position.set(
        Number(vehicle.positionX) || 0,
        0,
        Number(vehicle.positionY) || 0
      );
      object.rotation.y = (-Number(vehicle.rotation || 0) * Math.PI) / 180;

      const isSelected = vehicle.vehicleId === selectedVehicleId;
      object.traverse((child) => {
        if (!child.material || Array.isArray(child.material)) {
          return;
        }

        if (!child.userData.baseEmissive) {
          child.userData.baseEmissive = child.material.emissive
            ? child.material.emissive.clone()
            : new THREE.Color(0x000000);
        }

        if (child.material.emissive) {
          child.material.emissive.copy(isSelected ? new THREE.Color(0x2563eb) : child.userData.baseEmissive);
        }
      });
    });

    vehicleMapRef.current.forEach((object, vehicleId) => {
      if (nextIds.has(vehicleId)) {
        return;
      }

      scene.remove(object);
      object.traverse((child) => {
        if (child.geometry) {
          child.geometry.dispose();
        }
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material.forEach((material) => material.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
      vehicleMapRef.current.delete(vehicleId);
    });
  }, [selectedVehicleId, vehicles]);

  return <div className="twin-canvas" ref={containerRef} />;
}

export default DigitalTwinScene;
