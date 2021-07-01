<script lang="ts">
  import uuidv1 from 'uuid/v1';
  import FormStyledButton from '../elements/FormStyledButton.svelte';

  import FormSelectField from '../forms/FormSelectField.svelte';
  import FormTextField from '../forms/FormTextField.svelte';
  import FormCheckboxField from '../forms/FormCheckboxField.svelte';

  import FormProvider from '../forms/FormProvider.svelte';
  import FormSubmit from '../forms/FormSubmit.svelte';
  import ModalBase from '../modals/ModalBase.svelte';
  import { closeCurrentModal } from '../modals/modalTools';
  import ElectronFilesInput from '../impexp/ElectronFilesInput.svelte';
  import DropDownButton from '../elements/DropDownButton.svelte';
  import DataTypeEditor from './DataTypeEditor.svelte';
  import { editorAddColumn, editorDeleteColumn, editorModifyColumn, fillEditorColumnInfo } from 'dbgate-tools';

  export let columnInfo;
  export let setTableInfo;
  export let tableInfo;
  export let onAddNext;

</script>

<FormProvider initialValues={fillEditorColumnInfo(columnInfo, tableInfo)}>
  <ModalBase {...$$restProps}>
    <svelte:fragment slot="header"
      >{columnInfo ? 'Edit column' : `Add column ${(tableInfo?.columns || []).length + 1}`}</svelte:fragment
    >

    <FormTextField name="columnName" label="Column name" focused />
    <DataTypeEditor />

    <FormCheckboxField name="notNull" label="NOT NULL" />
    <FormCheckboxField name="isPrimaryKey" label="Is Primary Key" />
    <FormCheckboxField name="autoIncrement" label="Is Autoincrement" />
    <FormTextField name="defaultValue" label="Default value" />
    <FormTextField name="computedExpression" label="Computed expression" />

    <svelte:fragment slot="footer">
      <FormSubmit
        value={columnInfo ? 'Save' : 'Save and next'}
        on:click={e => {
          closeCurrentModal();
          if (columnInfo) {
            setTableInfo(tbl => editorModifyColumn(tbl, e.detail));
          } else {
            setTableInfo(tbl => editorAddColumn(tbl, e.detail));
            if (onAddNext) onAddNext();
          }
        }}
      />
      {#if !columnInfo}
        <FormStyledButton
          type="button"
          value="Save"
          on:click={e => {
            closeCurrentModal();
            setTableInfo(tbl => editorAddColumn(tbl, e.detail));
          }}
        />
      {/if}

      <FormStyledButton type="button" value="Close" on:click={closeCurrentModal} />
      {#if columnInfo}
        <FormStyledButton
          type="button"
          value="Remove"
          on:click={() => {
            closeCurrentModal();
            setTableInfo(tbl => editorDeleteColumn(tbl, columnInfo));
          }}
        />
      {/if}
    </svelte:fragment>
  </ModalBase>
</FormProvider>