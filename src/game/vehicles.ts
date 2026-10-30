// VEHICLES — 55+ vehicles
export interface VehicleStats {
  name: string; type: string; emoji: string;
  maxSpeed: number; acceleration: number;
  fuelCapacity: number; fuelEfficiency: number;
  armor: number; seats: number; cargoCapacity: number;
  durability: number; color: string; accentColor: string;
  noise: number; rarity: string;
  width: number; height: number;
  category: string; description: string;
}

export interface ActiveVehicle {
  id: string; stats: VehicleStats;
  x: number; y: number; angle: number;
  vx: number; vy: number;
  fuel: number; durability: number;
  driver: 1 | 2 | null; engineOn: boolean;
}

type Opt = Partial<VehicleStats>;

const V = (n: string, t: string, e: string, o: Opt = {}): VehicleStats => ({
  name: n, type: t, emoji: e,
  maxSpeed: 8, acceleration: 3,
  fuelCapacity: 50, fuelEfficiency: 4,
  armor: 10, seats: 4, cargoCapacity: 200,
  durability: 100, color: "#666", accentColor: "#333",
  noise: 60, rarity: "Comum",
  width: 2, height: 4,
  category: "Civilian", description: "",
  ...o,
});

export const VEHICLES: VehicleStats[] = [
  V("Knox Sedan", "sedan", "🚗", { maxSpeed: 10, color: "#3a4a5a" }),
  V("Muldraugh Coupe", "coupe", "🚗", { maxSpeed: 11, color: "#7a2a2a" }),
  V("Rosewood Compact", "compact", "🚗", { maxSpeed: 9, color: "#a0a0a0" }),
  V("Riverside SUV", "suv", "🚙", { maxSpeed: 9, color: "#2a3a5a", seats: 7 }),
  V("West Point Pickup", "pickup", "🛻", { maxSpeed: 8, color: "#5a4a2a" }),
  V("Family Van", "van", "🚐", { maxSpeed: 8, seats: 8, color: "#4a4a4a" }),
  V("Yellow Taxi", "taxi", "🚕", { maxSpeed: 10, color: "#d9a52a" }),
  V("Stretch Limo", "limo", "🚘", { maxSpeed: 10, seats: 8, color: "#0a0a0a", rarity: "Raro" }),
  V("Racing Sport", "racecar", "🏎️", { maxSpeed: 16, color: "#c93a3a", rarity: "Épico" }),
  V("Convertible", "convertible", "🚗", { maxSpeed: 11, color: "#3a8a4a", rarity: "Incomum" }),
  V("Hatchback", "hatchback", "🚗", { maxSpeed: 9, color: "#5a5aaa" }),
  V("Station Wagon", "wagon", "🚙", { maxSpeed: 8, color: "#6a5a4a" }),
  V("Muscle Coupe", "muscle", "🚗", { maxSpeed: 13, color: "#1a1a1a", rarity: "Raro" }),
  V("Mini Cooper", "mini", "🚗", { maxSpeed: 10, color: "#3a6a9a" }),
  V("Off-Road Jeep", "jeep", "🚙", { maxSpeed: 9, color: "#4a5a2a", armor: 25 }),
  V("Police Cruiser", "police", "🚓", { maxSpeed: 13, color: "#0a1a3a", rarity: "Incomum" }),
  V("Ambulance", "ambulance", "🚑", { maxSpeed: 11, color: "#f0f0f0", rarity: "Incomum" }),
  V("Fire Engine", "firetruck", "🚒", { maxSpeed: 9, color: "#c92a2a", rarity: "Raro" }),
  V("SWAT Van", "swat", "🚐", { maxSpeed: 10, color: "#1a1a1a", rarity: "Raro" }),
  V("Police Motorcycle", "policeBike", "🏍️", { maxSpeed: 14, color: "#0a1a3a", width: 1, height: 2 }),
  V("Humvee", "humvee", "🚙", { maxSpeed: 10, armor: 80, color: "#3a4a2a", rarity: "Épico" }),
  V("Army Jeep", "armyJeep", "🚙", { maxSpeed: 11, armor: 40, color: "#3a4a2a", rarity: "Raro" }),
  V("APC", "apc", "🚛", { maxSpeed: 8, armor: 120, seats: 10, color: "#3a4a2a", rarity: "Épico" }),
  V("Battle Tank", "tank", "🛻", { maxSpeed: 6, armor: 250, color: "#3a4a2a", rarity: "Lendário" }),
  V("Missile Truck", "missile", "🚚", { maxSpeed: 7, armor: 100, color: "#3a4a2a", rarity: "Lendário" }),
  V("Patrol Boat", "patrolBoat", "🚤", { maxSpeed: 12, armor: 50, color: "#3a4a2a", rarity: "Épico" }),
  V("Recon Buggy", "buggy", "🚜", { maxSpeed: 13, armor: 30, color: "#5a5a3a", rarity: "Raro" }),
  V("Supply Truck", "supplyTruck", "🚚", { maxSpeed: 7, armor: 35, cargoCapacity: 1500, color: "#4a4a2a", rarity: "Raro" }),
  V("Tractor", "tractor", "🚜", { maxSpeed: 5, color: "#3a8a3a", cargoCapacity: 800, category: "Industrial" }),
  V("Harvester", "harvester", "🚜", { maxSpeed: 4, color: "#aa6a2a", cargoCapacity: 1200, rarity: "Incomum", category: "Industrial" }),
  V("Forklift", "forklift", "🚜", { maxSpeed: 5, color: "#d9a52a", cargoCapacity: 600, category: "Industrial" }),
  V("Bulldozer", "bulldozer", "🚜", { maxSpeed: 4, armor: 60, color: "#d9a52a", rarity: "Incomum", category: "Industrial" }),
  V("Excavator", "excavator", "🚜", { maxSpeed: 4, armor: 50, color: "#d9a52a", rarity: "Raro", category: "Industrial" }),
  V("Semi Truck", "semiTruck", "🚛", { maxSpeed: 9, cargoCapacity: 2000, color: "#5a5a5a", rarity: "Incomum", category: "Industrial" }),
  V("Tanker Truck", "tankerTruck", "🛢️", { maxSpeed: 7, cargoCapacity: 1500, color: "#aa6a2a", rarity: "Raro", category: "Industrial" }),
  V("Refrigerated Truck", "refrigerated", "🚚", { maxSpeed: 8, cargoCapacity: 1200, color: "#f0f0f0", rarity: "Incomum", category: "Industrial" }),
  V("Logging Truck", "logging", "🚛", { maxSpeed: 7, cargoCapacity: 1800, color: "#5a4a2a", rarity: "Incomum", category: "Industrial" }),
  V("Concrete Mixer", "mixer", "🚜", { maxSpeed: 6, cargoCapacity: 1000, color: "#aaaaaa", rarity: "Incomum", category: "Industrial" }),
  V("RV Motorhome", "rv", "🚙", { maxSpeed: 7, cargoCapacity: 700, seats: 6, color: "#d0d0d0", rarity: "Raro", category: "Recreational" }),
  V("Cargo Trailer", "trailer", "🚛", { maxSpeed: 0, cargoCapacity: 1500, color: "#5a5a5a", category: "Industrial" }),
  V("Motorbike", "motorbike", "🏍️", { maxSpeed: 14, color: "#1a1a1a", width: 1, height: 2 }),
  V("Scooter", "scooter", "🛵", { maxSpeed: 7, color: "#3a8a4a", width: 1, height: 2 }),
  V("ATV Quad", "atv", "🏍️", { maxSpeed: 11, color: "#aa3a2a", width: 1, height: 2, armor: 15 }),
  V("Dirt Bike", "dirtbike", "🏍️", { maxSpeed: 12, color: "#3a3a8a", width: 1, height: 2 }),
  V("Speed Boat", "speedboat", "🚤", { maxSpeed: 15, color: "#3a6a9a", rarity: "Raro", category: "Aquatic" }),
  V("Fishing Boat", "fishingBoat", "⛵", { maxSpeed: 6, color: "#5a4a2a", rarity: "Incomum", category: "Aquatic" }),
  V("Jet Ski", "jetski", "🚤", { maxSpeed: 13, color: "#aa3a2a", width: 1, height: 2, category: "Aquatic" }),
  V("Yacht", "yacht", "⛵", { maxSpeed: 10, color: "#f0f0f0", seats: 8, rarity: "Lendário", category: "Aquatic" }),
  V("Submarine", "submarine", "🚤", { maxSpeed: 5, armor: 200, color: "#1a3a3a", rarity: "Lendário", category: "Aquatic" }),
  V("Helicopter", "helicopter", "🚁", { maxSpeed: 18, color: "#3a3a3a", seats: 4, rarity: "Lendário", category: "Aerial" }),
  V("Small Plane", "plane", "✈️", { maxSpeed: 22, color: "#f0f0f0", seats: 4, rarity: "Lendário", category: "Aerial" }),
  V("Recon Drone", "drone", "🛸", { maxSpeed: 12, color: "#1a1a1a", seats: 0, rarity: "Épico", category: "Aerial" }),
  V("Hoverboard", "hoverboard", "🛹", { maxSpeed: 8, color: "#aa3aaa", seats: 1, width: 1, height: 1, rarity: "Raro", category: "Recreational" }),
  V("Segway", "segway", "🛴", { maxSpeed: 5, color: "#1a1a1a", seats: 1, width: 1, height: 1, category: "Recreational" }),
  V("Bicycle", "bicycle", "🚲", { maxSpeed: 6, color: "#3a3a8a", seats: 1, width: 1, height: 2, fuelCapacity: 0, category: "Recreational" }),
  V("Tandem Bike", "tandem", "🚲", { maxSpeed: 7, color: "#aa3a3a", seats: 2, width: 1, height: 2, fuelCapacity: 0, rarity: "Incomum", category: "Recreational" }),
  V("Cargo Cycle", "cargoCycle", "🚲", { maxSpeed: 5, color: "#5a4a2a", seats: 1, cargoCapacity: 150, fuelCapacity: 0, category: "Recreational" }),
  V("Rickshaw", "rickshaw", "🛺", { maxSpeed: 6, color: "#d9a52a", seats: 3, fuelCapacity: 0, category: "Civilian" }),
  V("Horse Cart", "horseCart", "🐴", { maxSpeed: 5, color: "#8a5a3a", seats: 3, fuelCapacity: 0, rarity: "Incomum", category: "Civilian" }),
  V("Shopping Cart", "shoppingCart", "🛒", { maxSpeed: 3, color: "#aaaaaa", seats: 0, cargoCapacity: 50, fuelCapacity: 0, width: 1, height: 1, category: "Recreational" }),
  V("Wheelchair", "wheelchair", "♿", { maxSpeed: 3, color: "#3a3a3a", seats: 1, fuelCapacity: 0, width: 1, height: 1, category: "Civilian" }),
  V("Skateboard", "skateboard", "🛹", { maxSpeed: 6, color: "#3a3a3a", seats: 1, fuelCapacity: 0, width: 1, height: 1, category: "Recreational" }),
  V("Trolley Car", "trolley", "🚋", { maxSpeed: 5, color: "#aa3a2a", seats: 20, fuelCapacity: 0, rarity: "Incomum", category: "Civilian" }),
  V("Mine Cart", "minecart", "🚞", { maxSpeed: 4, color: "#5a4a2a", seats: 2, cargoCapacity: 300, fuelCapacity: 0, category: "Industrial" }),
  V("Bumper Car", "bumperCar", "🚗", { maxSpeed: 4, color: "#aa3aaa", seats: 1, rarity: "Incomum", category: "Recreational" }),
  V("Ice Cream Truck", "iceCreamTruck", "🚚", { maxSpeed: 8, color: "#aa3aaa", seats: 2, cargoCapacity: 200, rarity: "Incomum", category: "Civilian" }),
  V("Food Truck", "foodTruck", "🚚", { maxSpeed: 8, color: "#aa6a3a", seats: 2, cargoCapacity: 400, rarity: "Incomum", category: "Civilian" }),
  V("Armored Van", "armoredVan", "🚐", { maxSpeed: 9, armor: 80, color: "#1a1a1a", seats: 6, cargoCapacity: 800, rarity: "Raro", category: "Civilian" }),
  V("School Bus", "schoolBus", "🚌", { maxSpeed: 7, color: "#d9a52a", seats: 30, cargoCapacity: 500, rarity: "Incomum", category: "Civilian" }),
  V("Garbage Truck", "garbageTruck", "🚛", { maxSpeed: 6, color: "#3a8a3a", seats: 3, cargoCapacity: 1500, rarity: "Comum", category: "Industrial" }),
  V("Delivery Van", "deliveryVan", "🚐", { maxSpeed: 8, color: "#5a3a8a", seats: 2, cargoCapacity: 700, rarity: "Comum", category: "Civilian" }),
  V("Hover Bike", "hoverbike", "🏍️", { maxSpeed: 15, color: "#3aaaaa", seats: 1, width: 1, height: 2, rarity: "Lendário", category: "Recreational" }),
  V("Cyber Bike", "cyberBike", "🏍️", { maxSpeed: 17, color: "#aa3aaa", seats: 1, width: 1, height: 2, rarity: "Lendário", category: "Recreational" }),
  V("Sand Buggy", "sandBuggy", "🚜", { maxSpeed: 12, color: "#d9a52a", seats: 2, armor: 20, category: "Recreational" }),
];

export function randomVehicleAtRoad(): VehicleStats {
  const civilians = VEHICLES.filter(v => v.category === "Civilian" && v.rarity === "Comum");
  return civilians[Math.floor(Math.random() * civilians.length)];
}

export function createVehicle(stats: VehicleStats, x: number, y: number): ActiveVehicle {
  return {
    id: `veh-${Math.random().toString(36).slice(2, 8)}`,
    stats,
    x, y, angle: 0,
    vx: 0, vy: 0,
    fuel: stats.fuelCapacity * (0.1 + Math.random() * 0.7),
    durability: stats.durability * (0.3 + Math.random() * 0.7),
    driver: null,
    engineOn: false,
  };
}