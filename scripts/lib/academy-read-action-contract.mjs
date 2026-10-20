import ts from 'typescript';
export function academyDispatchedReadActions(source){
 const tree=ts.createSourceFile('academy.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS),actions=new Set();
 const conditions=node=>{
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken){
   const pairs=[[node.left,node.right],[node.right,node.left]];
   for(const [name,value] of pairs)if(ts.isIdentifier(name)&&name.text==='action'&&ts.isStringLiteral(value))actions.add(value.text);
  }
  ts.forEachChild(node,conditions);
 };
 const inspect=node=>{if(ts.isIfStatement(node))conditions(node.expression);ts.forEachChild(node,inspect);};
 const find=node=>{
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.name.text==='handleReadAction'&&node.initializer&&ts.isArrowFunction(node.initializer))inspect(node.initializer.body);
  else ts.forEachChild(node,find);
 };
 find(tree);return actions;
}

// Follow delegated action registries only when they are actually imported and
// used by an actionBody dispatch condition. Comments and unused sets do not
// establish a live route contract.
export function academyDispatchedWriteActions(source,modules={}){
 const parse=(name,text)=>ts.createSourceFile(name,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 const tree=parse('academy.ts',source),actions=new Set(),bindings=new Map();
 for(const statement of tree.statements){
  if(!ts.isImportDeclaration(statement)||!ts.isStringLiteral(statement.moduleSpecifier))continue;
  const text=modules[statement.moduleSpecifier.text],names=statement.importClause?.namedBindings;
  if(!text||!names||!ts.isNamedImports(names))continue;
  const registries=new Map();const collect=node=>{
   if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name)&&node.initializer&&ts.isNewExpression(node.initializer)
    &&ts.isIdentifier(node.initializer.expression)&&node.initializer.expression.text==='Set'){
    const list=node.initializer.arguments?.[0];if(list&&ts.isArrayLiteralExpression(list)&&list.elements.every(ts.isStringLiteral))registries.set(node.name.text,list.elements.map(item=>item.text));
   }
   ts.forEachChild(node,collect);
  };collect(parse(statement.moduleSpecifier.text,text));
  for(const entry of names.elements){const values=registries.get((entry.propertyName??entry.name).text);if(values)bindings.set(entry.name.text,values);}
 }
 const condition=node=>{
  if(ts.isBinaryExpression(node)&&node.operatorToken.kind===ts.SyntaxKind.EqualsEqualsEqualsToken){
   for(const [name,value] of [[node.left,node.right],[node.right,node.left]])if(ts.isIdentifier(name)&&name.text==='actionBody'&&ts.isStringLiteral(value))actions.add(value.text);
  }
  if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='has'
   &&ts.isIdentifier(node.expression.expression)&&node.arguments.length===1&&ts.isIdentifier(node.arguments[0])&&node.arguments[0].text==='actionBody'){
   for(const value of bindings.get(node.expression.expression.text)??[])actions.add(value);
  }
  ts.forEachChild(node,condition);
 };
 const visit=node=>{if(ts.isIfStatement(node))condition(node.expression);ts.forEachChild(node,visit);};visit(tree);return actions;
}
