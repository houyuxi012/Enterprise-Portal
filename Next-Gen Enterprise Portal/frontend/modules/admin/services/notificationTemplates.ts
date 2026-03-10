import ApiClient, {
  type NotificationTemplateCategory,
  type NotificationTemplateDTO,
  type NotificationTemplateListParams,
  type NotificationTemplatePreviewPayload,
  type NotificationTemplatePreviewResponseDTO,
  type NotificationTemplateUpsertPayload,
} from '@/shared/services/api';

export type NotificationTemplateRecord = NotificationTemplateDTO;
export type NotificationTemplateFormInput = NotificationTemplateUpsertPayload;
export type NotificationTemplateFilterInput = NotificationTemplateListParams;
export type NotificationTemplatePreviewResult = NotificationTemplatePreviewResponseDTO;
export type NotificationTemplatePreviewInput = NotificationTemplatePreviewPayload;

export const NOTIFICATION_TEMPLATE_ACTIVE_CATEGORY_STORAGE_KEY = 'notificationTemplatesActiveCategory';

class NotificationTemplateService {
  async listTemplates(filters?: NotificationTemplateFilterInput): Promise<NotificationTemplateRecord[]> {
    return ApiClient.getNotificationTemplates(filters);
  }

  async createTemplate(input: NotificationTemplateFormInput): Promise<NotificationTemplateRecord> {
    return ApiClient.createNotificationTemplate(input);
  }

  async previewTemplate(input: NotificationTemplatePreviewInput): Promise<NotificationTemplatePreviewResult> {
    return ApiClient.previewNotificationTemplate(input);
  }

  async updateTemplate(templateId: number, input: NotificationTemplateFormInput): Promise<NotificationTemplateRecord> {
    return ApiClient.updateNotificationTemplate(templateId, input);
  }

  async updateTemplateStatus(templateId: number, isEnabled: boolean): Promise<NotificationTemplateRecord> {
    return ApiClient.updateNotificationTemplateStatus(templateId, isEnabled);
  }

  async deleteTemplate(templateId: number): Promise<void> {
    await ApiClient.deleteNotificationTemplate(templateId);
  }
}

const notificationTemplateService = new NotificationTemplateService();

export default notificationTemplateService;
