"use client";

import { useState } from "react";
import { Button, Form, Input, Modal, message } from "antd";
import { FolderOpen } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineApi } from "./pipeline-api";

export type NewProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
};

export function NewProjectDialog({ open, onClose, onCreated }: NewProjectDialogProps) {
  const { t } = useI18n();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      await pipelineApi.createProject({
        title: values.title.trim(),
        originalText: "",
        rootPath: joinProjectPath(values.parentDirectory.trim(), values.title),
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

  const handleBrowse = async () => {
    const selected = await window.poAgentDesktop?.selectProjectDirectory();
    if (selected) form.setFieldValue("parentDirectory", selected);
  };

  const title = Form.useWatch("title", form) as string | undefined;
  const parentDirectory = Form.useWatch("parentDirectory", form) as string | undefined;
  const projectPath = title?.trim() && parentDirectory?.trim()
    ? joinProjectPath(parentDirectory.trim(), title)
    : "";

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
        <Form.Item
          name="parentDirectory"
          label={t.pipeline.dialogProjectLocation}
          extra={projectPath
            ? `${t.pipeline.dialogProjectPathPreview}: ${projectPath}`
            : t.pipeline.dialogProjectLocationHint}
          rules={[{ required: true, message: t.pipeline.dialogProjectLocationPlaceholder }]}
        >
          <Input
            placeholder={t.pipeline.dialogProjectLocationPlaceholder}
            addonAfter={typeof window !== "undefined" && window.poAgentDesktop ? (
              <Button
                type="text"
                size="small"
                icon={<FolderOpen className="size-4" />}
                onClick={handleBrowse}
              >
                {t.pipeline.dialogBrowse}
              </Button>
            ) : null}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function joinProjectPath(parentDirectory: string, title: string) {
  const normalized = title
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 80);
  const folderName = normalized && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(normalized)
    ? normalized
    : "pipeline-project";
  const separator = parentDirectory.includes("\\") ? "\\" : "/";
  return `${parentDirectory.replace(/[\\/]+$/, "")}${separator}${folderName}`;
}
