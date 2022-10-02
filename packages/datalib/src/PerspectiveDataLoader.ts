import { Condition, Expression, Select } from 'dbgate-sqltree';
import { PerspectiveDataLoadProps } from './PerspectiveDataProvider';
import debug from 'debug';
import _zipObject from 'lodash/zipObject';

const dbg = debug('dbgate:PerspectiveDataLoader');

export class PerspectiveDataLoader {
  constructor(public apiCall) {}

  buildSqlCondition(props: PerspectiveDataLoadProps): Condition {
    const { schemaName, pureName, bindingColumns, bindingValues, dataColumns, orderBy, sqlCondition } = props;

    const conditions = [];

    if (sqlCondition) {
      conditions.push(sqlCondition);
    }

    if (bindingColumns?.length == 1) {
      conditions.push({
        conditionType: 'in',
        expr: {
          exprType: 'column',
          columnName: bindingColumns[0],
          source: {
            name: { schemaName, pureName },
          },
        },
        values: bindingValues.map(x => x[0]),
      });
    }

    return conditions.length > 0
      ? {
          conditionType: 'and',
          conditions,
        }
      : null;
  }

  buildMongoCondition(props: PerspectiveDataLoadProps): {} {
    const { schemaName, pureName, bindingColumns, bindingValues, dataColumns, orderBy, mongoCondition } = props;

    const conditions = [];

    if (mongoCondition) {
      conditions.push(mongoCondition);
    }

    if (bindingColumns?.length == 1) {
      conditions.push({
        [bindingColumns[0]]: { $in: bindingValues.map(x => x[0]) },
      });
    }

    return conditions.length == 1 ? conditions[0] : conditions.length > 0 ? { $and: conditions } : null;
  }

  async loadGroupingSqlDb(props: PerspectiveDataLoadProps) {
    const { schemaName, pureName, bindingColumns } = props;

    const bindingColumnExpressions = bindingColumns.map(
      columnName =>
        ({
          exprType: 'column',
          columnName,
          source: {
            name: { schemaName, pureName },
          },
        } as Expression)
    );

    const select: Select = {
      commandType: 'select',
      from: {
        name: { schemaName, pureName },
      },
      columns: [
        {
          exprType: 'call',
          func: 'COUNT',
          args: [
            {
              exprType: 'raw',
              sql: '*',
            },
          ],
          alias: '_perspective_group_size_',
        },
        ...bindingColumnExpressions,
      ],
      where: this.buildSqlCondition(props),
    };

    select.groupBy = bindingColumnExpressions;

    if (dbg?.enabled) {
      dbg(`LOAD COUNTS, table=${props.pureName}, columns=${bindingColumns?.join(',')}`);
    }

    const response = await this.apiCall('database-connections/sql-select', {
      conid: props.databaseConfig.conid,
      database: props.databaseConfig.database,
      select,
    });

    if (response.errorMessage) return response;
    return response.rows.map(row => ({
      ...row,
      _perspective_group_size_: parseInt(row._perspective_group_size_),
    }));
  }

  async loadGroupingDocDb(props: PerspectiveDataLoadProps) {
    const { schemaName, pureName, bindingColumns } = props;

    const aggregate = [
      { $match: this.buildMongoCondition(props) },
      {
        $group: {
          _id: _zipObject(
            bindingColumns,
            bindingColumns.map(col => '$' + col)
          ),
          count: { $sum: 1 },
        },
      },
    ];

    if (dbg?.enabled) {
      dbg(`LOAD COUNTS, table=${props.pureName}, columns=${bindingColumns?.join(',')}`);
    }

    const response = await this.apiCall('database-connections/collection-data', {
      conid: props.databaseConfig.conid,
      database: props.databaseConfig.database,
      options: {
        pureName,
        aggregate,
      },
    });

    if (response.errorMessage) return response;
    return response.rows.map(row => ({
      ...row._id,
      _perspective_group_size_: parseInt(row.count),
    }));
  }

  async loadGrouping(props: PerspectiveDataLoadProps) {
    const { engineType } = props;
    switch (engineType) {
      case 'sqldb':
        return this.loadGroupingSqlDb(props);
      case 'docdb':
        return this.loadGroupingDocDb(props);
    }
  }

  async loadDataSqlDb(props: PerspectiveDataLoadProps) {
    const {
      schemaName,
      pureName,
      bindingColumns,
      bindingValues,
      dataColumns,
      orderBy,
      sqlCondition: condition,
      engineType,
    } = props;

    if (dataColumns?.length == 0) {
      return [];
    }

    const select: Select = {
      commandType: 'select',
      from: {
        name: { schemaName, pureName },
      },
      columns: dataColumns?.map(columnName => ({
        exprType: 'column',
        columnName,
        source: {
          name: { schemaName, pureName },
        },
      })),
      selectAll: !dataColumns,
      orderBy: orderBy?.map(({ columnName, order }) => ({
        exprType: 'column',
        columnName,
        direction: order,
        source: {
          name: { schemaName, pureName },
        },
      })),
      range: props.range,
      where: this.buildSqlCondition(props),
    };

    if (dbg?.enabled) {
      dbg(
        `LOAD DATA, table=${props.pureName}, columns=${props.dataColumns?.join(',')}, range=${props.range?.offset},${
          props.range?.limit
        }`
      );
    }

    const response = await this.apiCall('database-connections/sql-select', {
      conid: props.databaseConfig.conid,
      database: props.databaseConfig.database,
      select,
    });

    if (response.errorMessage) return response;
    return response.rows;
  }

  getDocDbLoadOptions(props: PerspectiveDataLoadProps, useSort: boolean) {
    const { pureName } = props;
    const res: any = {
      pureName,
      condition: this.buildMongoCondition(props),
      skip: props.range?.offset,
      limit: props.range?.limit,
    };
    if (useSort && props.orderBy?.length > 0) {
      res.sort = _zipObject(
        props.orderBy.map(col => col.columnName),
        props.orderBy.map(col => (col.order == 'DESC' ? -1 : 1))
      );
    }

    return res;
  }

  async loadDataDocDb(props: PerspectiveDataLoadProps) {
    const {
      schemaName,
      pureName,
      bindingColumns,
      bindingValues,
      dataColumns,
      orderBy,
      sqlCondition: condition,
      engineType,
    } = props;

    if (dbg?.enabled) {
      dbg(
        `LOAD DATA, collection=${props.pureName}, columns=${props.dataColumns?.join(',')}, range=${
          props.range?.offset
        },${props.range?.limit}`
      );
    }

    const options = this.getDocDbLoadOptions(props, true);

    const response = await this.apiCall('database-connections/collection-data', {
      conid: props.databaseConfig.conid,
      database: props.databaseConfig.database,
      options,
    });

    if (response.errorMessage) return response;
    return response.rows;
  }

  async loadData(props: PerspectiveDataLoadProps) {
    const { engineType } = props;
    switch (engineType) {
      case 'sqldb':
        return this.loadDataSqlDb(props);
      case 'docdb':
        return this.loadDataDocDb(props);
    }
  }

  async loadRowCountSqlDb(props: PerspectiveDataLoadProps) {
    const {
      schemaName,
      pureName,
      bindingColumns,
      bindingValues,
      dataColumns,
      orderBy,
      sqlCondition: condition,
    } = props;

    const select: Select = {
      commandType: 'select',
      from: {
        name: { schemaName, pureName },
      },
      columns: [
        {
          exprType: 'raw',
          sql: 'COUNT(*)',
          alias: 'count',
        },
      ],
      where: this.buildSqlCondition(props),
    };

    const response = await this.apiCall('database-connections/sql-select', {
      conid: props.databaseConfig.conid,
      database: props.databaseConfig.database,
      select,
    });

    if (response.errorMessage) return response;
    return response.rows[0];
  }

  async loadRowCountDocDb(props: PerspectiveDataLoadProps) {
    const {
      schemaName,
      pureName,
      bindingColumns,
      bindingValues,
      dataColumns,
      orderBy,
      sqlCondition: condition,
    } = props;

    const options = {
      ...this.getDocDbLoadOptions(props, false),
      countDocuments: true,
    };

    const response = await this.apiCall('database-connections/collection-data', {
      conid: props.databaseConfig.conid,
      database: props.databaseConfig.database,
      options,
    });

    return response;
  }

  async loadRowCount(props: PerspectiveDataLoadProps) {
    const { engineType } = props;
    switch (engineType) {
      case 'sqldb':
        return this.loadRowCountSqlDb(props);
      case 'docdb':
        return this.loadRowCountDocDb(props);
    }
  }
}
