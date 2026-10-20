import { combineGapCatalogs, defineGapCatalog, sharedGapCatalog } from "../shared/gaps";

/** Gaps that only the Spatial Engine can report, on top of the shared ones. */
const spatialOwnGapCatalog = defineGapCatalog({
  DATASET_GEOMETRY_INVALID: {
    severity: "BLOCKING",
    message: { ar: "هندسة البيانات «{dataset}» غير صالحة؛ لا يمكن استخدامها في القياس.", en: "The geometry of “{dataset}” is invalid and cannot be used for measurement." },
    remedy: { ar: "أصلح الهندسة في المصدر أو انشر إصدارًا مصحّحًا.", en: "Repair the geometry at the source or publish a corrected version." },
  },
  BOUNDARY_UNOFFICIAL: {
    severity: "INFO",
    message: { ar: "حدود المناطق الإدارية مأخوذة من «{dataset}» وهي ليست حدودًا رسمية صادرة عن جهة حكومية.", en: "Administrative boundaries come from “{dataset}”, which is not an official boundary issued by a government authority." },
    remedy: { ar: "اعتمد الحدود الرسمية متى نُشرت في مركز البيانات.", en: "Use the official boundaries once they are published in the Data Center." },
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
