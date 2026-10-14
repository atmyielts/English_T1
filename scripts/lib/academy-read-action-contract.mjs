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
