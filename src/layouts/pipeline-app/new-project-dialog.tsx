"use client";

import { useState } from "react";
import { Form, Input, Modal, message } from "antd";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineApi } from "./pipeline-api";

export type NewProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

const WORKSPACE_ID = "default";

export function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const { t } = useI18n();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await pipelineApi.createProject({
        title: values.title,
        originalText: "",
        workspaceId: WORKSPACE_ID,
      });
      onCreated();
      form.resetFields();
    } catch (error) {
      if (error instanceof Error && error.message !== "Validation failed") {
        message.error(error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title={t.pipeline.dialogTitle}
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={loading}
      okText={t.pipeline.dialogCreate}
      cancelText={t.pipeline.dialogCancel}
      width={480}
      destroyOnHidden
      mask={{ closable: false }}
      keyboard={false}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          name="title"
          label={t.pipeline.dialogProjectTitle}
          rules={[{ required: true, message: t.pipeline.dialogProjectTitlePlaceholder }]}
        >
          <Input autoFocus placeholder={t.pipeline.dialogProjectTitlePlaceholder} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
