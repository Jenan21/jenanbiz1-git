export type MarketFlowDefinition = {
  kind: string;
  route: string;
  sections: readonly (readonly [string, string])[];
  title: readonly [string, string];
};

export const marketFlowDefinitions: readonly MarketFlowDefinition[] = [
  { route: "/market/listings", title: ["قائمة العروض", "Market listings"], kind: "list", sections: [["بحث", "Search"], ["السعر", "Price"], ["الموقع", "Location"], ["الحالة", "Status"]] },
  { route: "/market/listing/sample", title: ["تفاصيل الإعلان", "Listing details"], kind: "detail", sections: [["الوصف", "Description"], ["المؤشرات المصرح بها", "Authorized indicators"], ["المستندات", "Documents"], ["السرية", "Confidentiality"]] },
  { route: "/market/nda/sample", title: ["اتفاقية السرية", "Confidentiality agreement"], kind: "form", sections: [["نص الاتفاقية", "Agreement"], ["الأطراف", "Parties"], ["الموافقة", "Acceptance"]] },
  { route: "/market/listing/sample/secure", title: ["التفاصيل المحمية", "Protected details"], kind: "detail", sections: [["التفاصيل", "Details"], ["المستندات", "Documents"], ["الصور", "Images"], ["معلومات إضافية", "Additional information"]] },
  { route: "/market/viewing/sample", title: ["حجز المعاينة", "Viewing request"], kind: "form", sections: [["التاريخ", "Date"], ["الوقت", "Time"], ["الحضور", "Attendees"], ["الملاحظات", "Notes"]] },
  { route: "/market/offer/sample", title: ["تقديم عرض شراء", "Submit purchase offer"], kind: "form", sections: [["القيمة", "Value"], ["الشروط", "Terms"], ["المدة", "Validity"], ["الملاحظات", "Notes"]] },
  { route: "/market/deal/sample", title: ["مسار الصفقة", "Deal stages"], kind: "timeline", sections: [["تواصل", "Contact"], ["NDA", "NDA"], ["فحص", "Review"], ["معاينة", "Viewing"], ["عرض", "Offer"], ["تفاوض", "Negotiation"], ["إغلاق", "Closing"]] },
  { route: "/market/deal/sample/report", title: ["تقرير الصفقة", "Deal report"], kind: "report", sections: [["الأطراف", "Parties"], ["المراحل", "Stages"], ["المستندات", "Documents"], ["العروض", "Offers"], ["الحالة", "Status"]] },
  { route: "/market/sell", title: ["إنشاء إعلان بيع", "Create sale listing"], kind: "wizard", sections: [["نوع الأصل", "Asset type"], ["المعلومات الأساسية", "Basic information"], ["التقييم", "Valuation"], ["السرية", "Confidentiality"]] },
  { route: "/market/sell/media", title: ["صور ومستندات الإعلان", "Listing media and documents"], kind: "form", sections: [["الصور", "Images"], ["الملفات", "Files"], ["المستندات", "Documents"], ["إعدادات السرية", "Visibility"]] },
  { route: "/market/sell/review", title: ["مراجعة ونشر الإعلان", "Review and publish"], kind: "detail", sections: [["المعاينة", "Preview"], ["البيانات", "Data"], ["الملفات", "Files"], ["السرية", "Confidentiality"]] },
];

export function findMarketFlow(route: string) {
  return marketFlowDefinitions.find((item) => item.route === route);
}