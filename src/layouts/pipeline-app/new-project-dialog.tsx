"use client";

import { useState } from "react";
import { Modal, Input, Form, Radio, message } from "antd";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineApi } from "./pipeline-api";

export type NewProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (projectId: string) => void;
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
      const project = await pipelineApi.createProject({
        title: values.title,
        originalText: values.originalText ?? "",
        workspaceId: WORKSPACE_ID,
        artDirection: values.artDirection,
      });
      onCreated(project.id);
      form.resetFields();
    } catch (err) {
      if (err instanceof Error && err.message !== "Validation failed") {
        message.error(err.message);
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
      width={560}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          name="title"
          label={t.pipeline.dialogProjectTitle}
          rules={[{ required: true, message: t.pipeline.dialogProjectTitlePlaceholder }]}
        >
          <Input placeholder={t.pipeline.dialogProjectTitlePlaceholder} />
        </Form.Item>
        <Form.Item
          name="originalText"
          label={t.pipeline.dialogScript}
        >
          <Input.TextArea
            placeholder={t.pipeline.dialogScriptPlaceholder}
            rows={8}
          />
        </Form.Item>
        <Form.Item
          name="artDirection"
          label="画风选择"
        >
          <Radio.Group>
            <Radio value="realistic">写实</Radio>
            <Radio value="anime">动漫</Radio>
            <Radio value="watercolor">水彩</Radio>
            <Radio value="oil">油画</Radio>
            <Radio value="3d">3D渲染</Radio>
          </Radio.Group>
        </Form.Item>
      </Form>
    </Modal>
  );
}
