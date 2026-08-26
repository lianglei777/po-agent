"use client";

import { useState } from "react";
import { Button, Form, Input, Modal, message } from "antd";
import type { ProjectResponse } from "@/contracts/pipeline";
import { FolderOpen } from "@/components/icons";
import { useI18n } from "@/i18n/use-i18n";
import { pipelineApi } from "./pipeline-api";

export type OpenProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  onOpened: (project: ProjectResponse) => void;
};

export function OpenProjectDialog({ open, onClose, onOpened }: OpenProjectDialogProps) {
  const { t } = useI18n();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    try {
      const values = await form.validateFields();
      setLoading(true);
      const project = await pipelineApi.openProject(values.rootPath.trim());
      form.resetFields();
      onOpened(project);
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
    if (selected) form.setFieldValue("rootPath", selected);
  };

  return (
    <Modal
      title={t.pipeline.openExistingProject}
      open={open}
      onOk={handleOpen}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      confirmLoading={loading}
      okText={t.pipeline.dialogOpen}
      cancelText={t.pipeline.dialogCancel}
      width={560}
      destroyOnHidden
      keyboard={false}
      mask={{ closable: false }}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          name="rootPath"
          label={t.pipeline.existingProjectLocation}
          extra={t.pipeline.existingProjectLocationHint}
          rules={[{ required: true, message: t.pipeline.existingProjectLocationPlaceholder }]}
        >
          <Input
            autoFocus
            placeholder={t.pipeline.existingProjectLocationPlaceholder}
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
