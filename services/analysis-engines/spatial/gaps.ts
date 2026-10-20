import { combineGapCatalogs, defineGapCatalog, sharedGapCatalog } from "../shared/gaps";

/** Gaps that only the Spatial Engine can report, on top of the shared ones. */
const spatialOwnGapCatalog = defineGapCatalog({
  DATASET_GEOMETRY_INVALID: {
    severity: "BLOCKING",
    message: { ar: "هندسة البيانات «{dataset}» غير صالحة؛ لا يمكن استخدامها في القياس.", en: "The geometry of “{dataset}” is invalid and cannot be used for measurement." },
    remedy: { ar: "أصلح الهندسة في المصدر أو انشر إصدارًا مصحّحًا.", en: "Repair the geometry at the source or publish a corrected version." },
  },
  BOUNDARY_UNOFFICIAL: {
    // A value is produced, but it is limited: it rests on boundaries no government authority issued, and must be shown that way.
    severity: "WARNING",
    message: {
      ar: "حدود المناطق الإدارية مأخوذة من «{dataset}» وهي ليست حدودًا رسمية صادرة عن جهة حكومية؛ ويجب عرض النتائج التي تستند إليها على أنها مبنية على حدود غير رسمية.",
      en: "Administrative boundaries come from “{dataset}”, which is not an official boundary issued by a government authority; results that rest on it must be presented as based on unofficial boundaries.",
    },
    remedy: { ar: "اعتمد الحدود الرسمية متى نُشرت في مركز البيانات.", en: "Use the official boundaries once they are published in the Data Center." },
  },
  ADMIN_NEAR_BOUNDARY: {
    severity: "WARNING",
    message: {
      ar: "يبعد الموقع {distance} م عن حد «{unit}». دقة مواضع بيانات الحدود غير معلنة، لذلك قد يختلف الإسناد إلى هذه الوحدة عمّا تعطيه حدود رسمية.",
      en: "The location is {distance} m from the edge of “{unit}”. The positional accuracy of the boundary data is not declared, so the assignment to this unit may differ from the one an official boundary would give.",
    },
    remedy: { ar: "اعتبر الإسناد تقريبيًا وتحقق منه بحدود رسمية عند الحاجة.", en: "Treat the assignment as approximate and confirm it against an official boundary when it matters." },
  },
  ADMIN_AMBIGUOUS_ON_BOUNDARY: {
    severity: "WARNING",
    message: {
      ar: "يقع الموقع ضمن أكثر من مضلع حدود في المستوى نفسه ({units})؛ فهو على حافة مشتركة أو أن المضلعات متداخلة، لذلك لا تُحدَّد وحدة واحدة.",
      en: "The location is covered by more than one boundary polygon of the same level ({units}); it lies on a shared edge or the polygons overlap, so no single unit is stated.",
    },
    remedy: { ar: "استخدم الوحدات المذكورة بوصفها مرشحات، أو انقل الموقع بعيدًا عن الحافة المشتركة.", en: "Use the listed units as candidates, or move the location away from the shared edge." },
  },
  ADMIN_TARGET_SPANS_UNITS: {
    severity: "WARNING",
    message: {
      ar: "تتقاطع المنطقة المطلوبة مع أكثر من مضلع حدود في المستوى نفسه ({units})؛ وتُذكر الوحدة لنقطة المنطقة التمثيلية فقط.",
      en: "The area intersects more than one boundary polygon of the same level ({units}); the unit is stated for the representative point of the area only.",
    },
    remedy: { ar: "حلّل كل جزء من المنطقة على حدة إذا كانت الوحدة تهمّ المنطقة كلها.", en: "Analyse each part of the area separately if the unit matters for all of it." },
  },
  ADMIN_UNIT_NOT_FOUND: {
    severity: "WARNING",
    message: {
      ar: "يقع الموقع داخل حدود الدولة المرسومة لكن لا يغطيه أي مضلع في «{dataset}»؛ وقد توجد فجوات في بيانات الحدود.",
      en: "The location is inside the mapped country boundary but no polygon of “{dataset}” covers it; the boundary data may have gaps.",
    },
    remedy: { ar: "افحص بيانات حدود هذا المستوى بحثًا عن فجوات.", en: "Check the boundary data of this level for gaps." },
  },
  MAP_SOURCE_ID_UNRECOGNIZED: {
    severity: "WARNING",
    message: {
      ar: "لدى {count} معلمًا في «{dataset}» قرب الموقع معرّف مصدر لا يتعرف عليه المحرك، فنوعها غير معروف؛ ولم تُحسب النتيجة لأن أحدها قد يكون أقرب من أي معلم من النوع المطلوب.",
      en: "{count} features of “{dataset}” near the location have a source identifier the engine does not recognize, so their kind is unknown; the result is not computed because one of them could be nearer than any feature of the requested kind.",
    },
    remedy: { ar: "صحّح معرّفات المصدر في بيانات الخريطة، أو حدّث عقد قراءة الخريطة في المحرك إن كان التنسيق قد تغيّر عمدًا.", en: "Fix the source identifiers in the Map data, or update the engine's Map contract if the format was changed on purpose." },
  },
  MAP_NOT_PUBLISHED: {
    severity: "BLOCKING",
    message: {
      ar: "لا يوجد في الخريطة إصدار منشور ومفعّل (الحالة: {state})، لذلك لا تتوفر بيانات مسجّلة من الخريطة.",
      en: "The Map has no published and enabled release (state: {state}), so no registered Map data is available.",
    },
    remedy: { ar: "انشر إصدارًا مراجَعًا من الخريطة وفعّل الخريطة.", en: "Publish a reviewed Map release and enable the Map." },
  },
  ROAD_LABEL_POINTS_ONLY: {
    severity: "WARNING",
    message: { ar: "طبقة الطرق «{dataset}» تحتوي نقاط تسمية فقط وليست شبكة طرق؛ المسافات إليها تقريبية ولا تمثل مسافة الطريق.", en: "The road layer “{dataset}” contains label points only, not a road network; distances to it are approximate and are not road distances." },
    remedy: { ar: "أضف طبقة شبكة طرق إلى مركز البيانات لقياس مسافات الطرق.", en: "Add a road-network layer to the Data Center to measure road distances." },
  },
  NETWORK_ANALYSIS_NOT_SUPPORTED: {
    severity: "INFO",
    message: { ar: "تُقاس المسافات بخط مستقيم على سطح الأرض؛ تحليل الشبكات (مسافة القيادة وزمن الوصول) غير مدعوم في هذا الإصدار.", en: "Distances are measured in a straight line on the Earth's surface; network analysis (driving distance and travel time) is not supported in this version." },
    remedy: { ar: "لا إجراء مطلوب؛ تُفسَّر المسافات على أنها مسافات خطية.", en: "No action is required; interpret distances as straight-line distances." },
  },
});

export const spatialGapCatalog = combineGapCatalogs(sharedGapCatalog, spatialOwnGapCatalog);
export type SpatialGapCode = keyof typeof spatialGapCatalog;
export { spatialOwnGapCatalog };
