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
  DATA_CENTER_NOT_IN_FORCE: {
    severity: "BLOCKING",
    message: {
      ar: "توجد في مركز البيانات مجموعات بيانات من النوع «{typeKey}» لكن لم يكن أيٌّ منها ساريًا بتاريخ {asOf}؛ لذلك لا تتوفر بيانات للدور «{role}».",
      en: "Data Center datasets of type “{typeKey}” exist, but none was in force as of {asOf}, so no data is available for role “{role}”.",
    },
    remedy: { ar: "اختر تاريخًا تسري فيه البيانات، أو حدّد الإصدار المطلوب صراحةً.", en: "Choose a date on which the data was in force, or pin the version explicitly." },
  },
  DATA_CENTER_CONTENT_INVALID: {
    severity: "BLOCKING",
    message: {
      ar: "محتوى إصدار مركز البيانات «{dataset}» ليس GeoJSON صالحًا بنظام WGS84 (الرمز: {code})؛ لم يُستخدم ولم يُصلح شيء منه.",
      en: "The content of Data Center version “{dataset}” is not valid WGS84 GeoJSON (code: {code}); it was not used and nothing was repaired.",
    },
    remedy: { ar: "انشر إصدارًا مصحّحًا من البيانات في مركز البيانات.", en: "Publish a corrected version of the data in the Data Center." },
  },
  DATA_CENTER_INTEGRITY_FAILED: {
    severity: "BLOCKING",
    message: {
      ar: "فشل التحقق من سلامة إصدار مركز البيانات للدور «{role}»: البصمة المخزّنة لا تطابق المحتوى المخزّن؛ لم تُستخدم البيانات.",
      en: "The integrity check of the Data Center version for role “{role}” failed: the stored checksum does not match the stored content, so the data was not used.",
    },
    remedy: { ar: "أبلغ مسؤول مركز البيانات؛ يجب فحص الإصدار واستعادته من نسخة سليمة.", en: "Report it to the Data Center administrator; the version must be examined and restored from a sound copy." },
  },
  DATA_CENTER_PIN_CHANGED: {
    severity: "BLOCKING",
    message: {
      ar: "محتوى إصدار مركز البيانات للدور «{role}» لا يطابق البصمة المتوقعة؛ لم يُستبدل بإصدار آخر ولم تُستخدم البيانات.",
      en: "The content of the Data Center version for role “{role}” does not match the expected checksum; it was not replaced by another version and the data was not used.",
    },
    remedy: { ar: "أعد تحديد الإصدار أو تأكد من أن البيانات لم تتغير.", en: "Pin the version again or confirm that the data has not changed." },
  },
  DATA_CENTER_VERSION_NOT_SPATIAL: {
    severity: "BLOCKING",
    message: {
      ar: "إصدار مركز البيانات المحدّد للدور «{role}» ليس من نوع البيانات المكانية (GeoJSON)؛ لا يمكن استخدامه في القياس.",
      en: "The Data Center version selected for role “{role}” is not spatial (GeoJSON) data and cannot be used for measurement.",
    },
    remedy: { ar: "حدّد مجموعة بيانات مكانية لهذا الدور.", en: "Select a spatial dataset for this role." },
  },
  DATA_CENTER_TOO_MANY_CANDIDATES: {
    severity: "BLOCKING",
    message: {
      ar: "عدد مجموعات البيانات من النوع «{typeKey}» كبير جدًا للدور «{role}»؛ لم يُختر أيٌّ منها حتى لا يعتمد الاختيار على جزء من النتائج.",
      en: "Too many Data Center datasets of type “{typeKey}” match for role “{role}”; none was selected so that the choice never rests on part of the matches.",
    },
    remedy: { ar: "ضيّق الطلب بنوع أدق أو بنطاق جغرافي أو حدّد الإصدار صراحةً.", en: "Narrow the request with a more specific type or geography, or pin the version." },
  },
  DATA_CENTER_COMPETING_DATASETS: {
    severity: "INFO",
    message: {
      ar: "وُجد {count} من مجموعات البيانات الأخرى من النوع «{typeKey}» سارية بالتاريخ نفسه؛ اختيرت «{dataset}» بحسب سياسة الاختيار {policy}.",
      en: "{count} other Data Center dataset(s) of type “{typeKey}” were in force at the same date; “{dataset}” was selected by the selection policy {policy}.",
    },
    remedy: { ar: "إن كان المطلوب مجموعة أخرى فحدّد إصدارها صراحةً.", en: "If another dataset is intended, pin its version explicitly." },
  },
  POPULATION_DATA_SCHEMA_UNSUPPORTED: {
    severity: "BLOCKING",
    message: {
      ar: "لا يطابق إصدار «{dataset}» مخطط السكان المطلوب: مضلعات ذات خاصية population كعدد صحيح غير سالب؛ لم يُحسب تقدير السكان.",
      en: "“{dataset}” does not match the required population schema: polygons with a non-negative integer population property; no population estimate was calculated.",
    },
    remedy: { ar: "انشر مناطق سكانية بمضلعات صالحة وخاصية population موثقة.", en: "Publish valid population polygons with a documented population property." },
  },
  POPULATION_AREA_WEIGHTED_ESTIMATE: {
    severity: "WARNING",
    message: {
      ar: "تقدير السكان ضمن النطاق يوزّع سكان كل مضلع بنسبة مساحة التقاطع، بافتراض تجانس التوزيع داخل المضلع.",
      en: "The population estimate apportions each polygon's population by its intersected area and assumes an even distribution within that polygon.",
    },
    remedy: { ar: "تحقق من المنهج ومصدر البيانات قبل مقارنة التقديرات.", en: "Review the method and source before comparing estimates." },
  },
  MAP_DATA_CENTER_BINDING_REFUSED: {
    severity: "WARNING",
    message: {
      ar: "لم يُقبل ربط الخريطة بمركز البيانات للطبقة «{dataset}» (السبب: {reason})؛ لذلك تُعامل الطبقة على أنها غير مسجّلة ولا تؤخذ حقوقها وجودتها من مركز البيانات.",
      en: "The Map's reference from layer “{dataset}” to the Data Center was not accepted (reason: {reason}), so the layer is treated as unregistered and its rights and quality are not taken from the Data Center.",
    },
    remedy: { ar: "أعد نشر إصدار الخريطة مرتبطًا بإصدار منشور حالي في مركز البيانات.", en: "Republish the Map release bound to a current published Data Center version." },
  },
  MAP_DATA_CENTER_BINDING_CHANGED: {
    severity: "INFO",
    message: {
      ar: "غيّر مركز البيانات بعض ما يذكره عن الإصدار المرتبط بالطبقة «{dataset}» منذ نشر الخريطة ({changes})؛ وتُستخدم أحدث بيانات مركز البيانات.",
      en: "Since the Map release was published, the Data Center changed what it states about the version bound to layer “{dataset}” ({changes}); the Data Center's current statements are used.",
    },
    remedy: { ar: "راجع التغييرات وأعد نشر إصدار الخريطة إن لزم.", en: "Review the changes and republish the Map release if needed." },
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
