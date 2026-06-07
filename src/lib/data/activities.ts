import { Activity } from "../types";
import { venueImageUrl } from "../utils/images";

type A = Omit<Activity, "imageUrl" | "description"> & { description: string };

const RAW: A[] = [
  { id: "a1", name: "OCT Kids Park", nameZh: "华侨城儿童乐园", type: "kids_park", setting: "outdoor", district: "Nanshan", address: "OCT, 8 Baishi Rd", lat: 22.496, lng: 113.976, rating: 4.6, durationHours: 2, scenarios: ["family"], timeSlots: ["afternoon", "morning"], familyFriendly: true, description: "Outdoor rides and shaded play zones for ages 3–10." },
  { id: "a2", name: "Shenzhen Museum Exhibition", nameZh: "深圳博物馆特展", type: "exhibition", setting: "indoor", district: "Futian", address: "Citizen Center, Fuzhong Rd", lat: 22.547, lng: 114.058, rating: 4.5, durationHours: 2, scenarios: ["friends", "family", "solo"], timeSlots: ["afternoon", "morning"], familyFriendly: true, description: "Rotating culture and history exhibits with AC comfort." },
  { id: "a3", name: "Dongmen Food Street Walk", nameZh: "东门美食街漫步", type: "food_street", setting: "mixed", district: "Luohu", address: "Dongmen Pedestrian St", lat: 22.549, lng: 114.124, rating: 4.3, durationHours: 1.5, scenarios: ["friends", "solo"], timeSlots: ["afternoon", "evening", "late_night"], familyFriendly: false, description: "Street snacks, neon lights, and people-watching." },
  { id: "a4", name: "Shenzhen Bay City Walk", nameZh: "深圳湾滨海漫步", type: "city_walk", setting: "outdoor", district: "Nanshan", address: "Shenzhen Bay Park", lat: 22.512, lng: 113.945, rating: 4.7, durationHours: 2, scenarios: ["family", "friends", "solo"], timeSlots: ["afternoon", "morning", "evening"], familyFriendly: true, description: "Seaside boardwalk with sunset views and bike rental." },
  { id: "a5", name: "Sea World Plaza", nameZh: "海上世界广场", type: "mall", setting: "mixed", district: "Nanshan", address: "Sea World, Nanhai Ave", lat: 22.487, lng: 113.917, rating: 4.4, durationHours: 2, scenarios: ["friends", "family"], timeSlots: ["afternoon", "evening"], familyFriendly: true, description: "Shopping, boats, and live music by the marina." },
  { id: "a6", name: "Lianhuashan Park", nameZh: "莲花山公园", type: "city_walk", setting: "outdoor", district: "Futian", address: "Hongli Rd, Futian", lat: 22.555, lng: 114.063, rating: 4.6, durationHours: 1.5, scenarios: ["family", "friends"], timeSlots: ["morning", "afternoon"], familyFriendly: true, description: "Iconic hilltop view over Futian CBD — easy hike." },
  { id: "a7", name: "Nanshan Kids Science Center", nameZh: "南山儿童科学馆", type: "kids_park", setting: "indoor", district: "Nanshan", address: "Nanshan Book City area", lat: 22.528, lng: 113.932, rating: 4.5, durationHours: 2.5, scenarios: ["family"], timeSlots: ["afternoon", "morning"], familyFriendly: true, description: "Hands-on science exhibits designed for young children." },
  { id: "a8", name: "Xintiandi Style Block", nameZh: "新天地街区", type: "food_street", setting: "mixed", district: "Futian", address: "Link City, Futian", lat: 22.538, lng: 114.051, rating: 4.4, durationHours: 2, scenarios: ["friends"], timeSlots: ["afternoon", "evening"], familyFriendly: false, description: "Trendy cafes and dessert shops for group hangouts." },
  { id: "a9", name: "Bao'an Central Park", nameZh: "宝安中心公园", type: "city_walk", setting: "outdoor", district: "Bao'an", address: "Bao'an CBD", lat: 22.553, lng: 113.887, rating: 4.3, durationHours: 1.5, scenarios: ["family", "solo"], timeSlots: ["morning", "afternoon", "evening"], familyFriendly: true, description: "Large lawns and fountain shows on weekends." },
  { id: "a10", name: "Longgang Art Warehouse", nameZh: "龙岗艺术仓", type: "exhibition", setting: "indoor", district: "Longgang", address: "Dafen area link", lat: 22.61, lng: 114.22, rating: 4.2, durationHours: 2, scenarios: ["friends", "solo"], timeSlots: ["afternoon", "evening"], familyFriendly: false, description: "Independent galleries and pop-up installations." },
  { id: "a11", name: "Shekou Old Town Walk", nameZh: "蛇口老街漫步", type: "city_walk", setting: "mixed", district: "Nanshan", address: "Shekou Taizi Rd", lat: 22.485, lng: 113.905, rating: 4.4, durationHours: 2, scenarios: ["friends", "family"], timeSlots: ["afternoon", "evening"], familyFriendly: true, description: "Colonial architecture mix with cafes and murals." },
  { id: "a12", name: "Yantian Lighthouse Trail", nameZh: "盐田灯塔步道", type: "city_walk", setting: "outdoor", district: "Yantian", address: "Meisha coast", lat: 22.596, lng: 114.32, rating: 4.6, durationHours: 3, scenarios: ["friends", "family"], timeSlots: ["morning", "afternoon"], familyFriendly: true, description: "Coastal trail with lighthouse photo spots." },
  { id: "a13", name: "Longhua Book City Events", nameZh: "龙华书城活动区", type: "exhibition", setting: "indoor", district: "Longhua", address: "Longhua Culture Center", lat: 22.665, lng: 114.038, rating: 4.1, durationHours: 1.5, scenarios: ["family", "solo"], timeSlots: ["afternoon"], familyFriendly: true, description: "Weekend book fairs and family workshops." },
  { id: "a14", name: "Guangming Forest Park", nameZh: "光明森林公园", type: "city_walk", setting: "outdoor", district: "Guangming", address: "Guangming Town", lat: 22.76, lng: 113.958, rating: 4.5, durationHours: 3, scenarios: ["family", "friends"], timeSlots: ["morning", "afternoon"], familyFriendly: true, description: "Green escape with picnic areas away from downtown heat." },
  { id: "a15", name: "Dapeng Ancient City", nameZh: "大鹏所城", type: "exhibition", setting: "mixed", district: "Dapeng", address: "Pengcheng Village", lat: 22.595, lng: 114.505, rating: 4.7, durationHours: 3, scenarios: ["friends", "family"], timeSlots: ["morning", "afternoon"], familyFriendly: true, description: "Ming-era walled town — history plus seaside day trip." },
  { id: "a16", name: "Luohu KK Mall Indoor Play", nameZh: "KK Mall室内乐园", type: "kids_park", setting: "indoor", district: "Luohu", address: "KK Mall L3", lat: 22.544, lng: 114.116, rating: 4.3, durationHours: 2, scenarios: ["family"], timeSlots: ["afternoon", "morning"], familyFriendly: true, description: "Rain-proof indoor playground when weather is bad." },
  { id: "a17", name: "Window of the World", nameZh: "世界之窗", type: "kids_park", setting: "mixed", district: "Nanshan", address: "9037 Shennan Blvd", lat: 22.538, lng: 113.972, rating: 4.5, durationHours: 4, scenarios: ["family", "friends"], timeSlots: ["afternoon", "morning", "evening"], familyFriendly: true, description: "Miniature landmarks and evening light shows — full half-day outing." },
  { id: "a18", name: "Happy Valley Shenzhen", nameZh: "欢乐谷", type: "kids_park", setting: "mixed", district: "Nanshan", address: "OCT Happy Valley", lat: 22.534, lng: 113.985, rating: 4.6, durationHours: 5, scenarios: ["family", "friends"], timeSlots: ["afternoon", "morning", "evening"], familyFriendly: true, description: "Roller coasters and water rides — best on weekdays for shorter queues." },
  { id: "a19", name: "MixC City Mall Futian", nameZh: "万象城福田", type: "mall", setting: "indoor", district: "Futian", address: "9289 Shennan Blvd", lat: 22.541, lng: 114.064, rating: 4.5, durationHours: 2.5, scenarios: ["friends", "family", "solo"], timeSlots: ["afternoon", "evening"], familyFriendly: true, description: "Luxury brands, cinema, and rooftop dining in one air-conditioned stop." },
  { id: "a20", name: "Dameisha Beach Day", nameZh: "大梅沙海滨", type: "city_walk", setting: "outdoor", district: "Yantian", address: "Dameisha Beach", lat: 22.598, lng: 114.308, rating: 4.4, durationHours: 3, scenarios: ["family", "friends"], timeSlots: ["morning", "afternoon"], familyFriendly: true, description: "Sand, swimming, and beach volleyball — bring sunscreen." },
  { id: "a21", name: "Dafen Oil Painting Village", nameZh: "大芬油画村", type: "exhibition", setting: "mixed", district: "Longgang", address: "Dafen Village, Buji", lat: 22.608, lng: 114.132, rating: 4.5, durationHours: 2.5, scenarios: ["friends", "solo", "family"], timeSlots: ["afternoon", "morning"], familyFriendly: true, description: "Gallery alleys where you can watch artists paint and buy originals." },
  { id: "a22", name: "Qianhai Waterfront Promenade", nameZh: "前海滨海步道", type: "city_walk", setting: "outdoor", district: "Nanshan", address: "Qianhai Bay Park", lat: 22.508, lng: 113.898, rating: 4.6, durationHours: 2, scenarios: ["friends", "solo", "family"], timeSlots: ["evening", "afternoon", "morning"], familyFriendly: true, description: "Modern skyline views and breezy sunset walks along new development." },
  { id: "a23", name: "Luohu Commercial City", nameZh: "罗湖商业城", type: "mall", setting: "indoor", district: "Luohu", address: "3002 Renmin S Rd", lat: 22.537, lng: 114.111, rating: 4.0, durationHours: 2, scenarios: ["friends", "solo"], timeSlots: ["afternoon", "evening"], familyFriendly: false, description: "Bargain shopping maze — great for souvenirs and tailor visits." },
  { id: "a24", name: "COCO Park Night Market", nameZh: "COCO Park夜市", type: "food_street", setting: "mixed", district: "Futian", address: "268 Fuhua 3rd Rd", lat: 22.533, lng: 114.053, rating: 4.4, durationHours: 2, scenarios: ["friends"], timeSlots: ["evening", "late_night"], familyFriendly: false, description: "Pop-up snack stalls and live DJs on weekend nights." },
  { id: "a25", name: "Futian Mangrove Boardwalk", nameZh: "福田红树林栈道", type: "city_walk", setting: "outdoor", district: "Futian", address: "Binhai Blvd, Futian", lat: 22.524, lng: 114.012, rating: 4.7, durationHours: 1.5, scenarios: ["family", "solo", "friends"], timeSlots: ["morning", "afternoon", "evening"], familyFriendly: true, description: "Bird-watching and mangrove ecology — flat path good for strollers." },
  { id: "a26", name: "Bao'an Fuyong River Walk", nameZh: "宝安福永河畔", type: "city_walk", setting: "outdoor", district: "Bao'an", address: "Fuyong Riverside Park", lat: 22.668, lng: 113.812, rating: 4.2, durationHours: 2, scenarios: ["family", "solo"], timeSlots: ["morning", "afternoon"], familyFriendly: true, description: "Quiet riverside path away from downtown crowds." },
  { id: "a27", name: "Universiade Sports Park", nameZh: "大运中心体育公园", type: "city_walk", setting: "outdoor", district: "Longgang", address: "Longgang Universiade Center", lat: 22.695, lng: 114.218, rating: 4.4, durationHours: 2.5, scenarios: ["friends", "family"], timeSlots: ["morning", "afternoon", "evening"], familyFriendly: true, description: "Jogging tracks, lakes, and occasional outdoor concerts." },
  { id: "a28", name: "OCT-LOFT Creative Block", nameZh: "华侨城创意园", type: "exhibition", setting: "mixed", district: "Nanshan", address: "Enping St, OCT Loft", lat: 22.49, lng: 113.98, rating: 4.6, durationHours: 2.5, scenarios: ["friends", "solo"], timeSlots: ["afternoon", "evening"], familyFriendly: false, description: "Street art, indie shops, and weekend design markets." },
];

/** Ticketed attractions (¥/person); walks and malls are 0 */
const ADMISSION_PER_PERSON: Record<string, number> = {
  a1: 88,
  a2: 40,
  a7: 68,
  a10: 35,
  a15: 28,
  a16: 110,
  a17: 180,
  a18: 220,
  a21: 30,
};

export const ACTIVITIES: Activity[] = RAW.map((a) => ({
  ...a,
  admissionPerPerson: ADMISSION_PER_PERSON[a.id] ?? 0,
  imageUrl: venueImageUrl(a.id, "activity", a.type),
}));

export function isOutdoorActivity(a: Activity): boolean {
  return a.setting === "outdoor";
}

export function isIndoorActivity(a: Activity): boolean {
  return a.setting === "indoor";
}

/** Outdoor or mixed venues that are not rain-safe (museums/malls excluded) */
export function isWeatherSensitive(a: Activity): boolean {
  if (a.setting === "indoor") return false;
  if (a.setting === "outdoor") return true;
  const d = a.description.toLowerCase();
  return !/indoor|ac |rain-proof|air-conditioned|museum|gallery|mall/i.test(d);
}
